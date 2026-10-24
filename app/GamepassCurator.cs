// 게임패스 큐레이터 데스크톱 앱
// docs/ 정적 웹앱을 WebView2로 띄우는 작은 WinForms 껍데기다.
// .NET Framework 4.x의 csc.exe(C# 5)로 빌드하므로 C# 6 이상 문법은 쓰지 않는다.
// 빌드: scripts\build-exe.ps1

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace GamepassCurator
{
    static class Program
    {
        public const string AppTitle = "게임패스 큐레이터";
        const string RuntimeDownloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

        [DllImport("user32.dll")]
        static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] args)
        {
            // 숨은 스위치: 창을 띄우지 않고 Steam 프록시만 점검한 뒤 결과를 app.log에 남기고 끝낸다
            foreach (string a in args)
            {
                if (string.Equals(a, "--selftest", StringComparison.OrdinalIgnoreCase)) return SelfTest.Run();
            }

            // 고해상도 모니터에서 글자가 흐려지지 않게 한다 (Per-Monitor V2, 안 되면 System DPI)
            try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
            catch (Exception) { try { SetProcessDPIAware(); } catch (Exception) { } }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string version = null;
            try { version = CoreWebView2Environment.GetAvailableBrowserVersionString(); }
            catch (Exception) { version = null; }

            if (string.IsNullOrEmpty(version))
            {
                DialogResult r = MessageBox.Show(
                    "이 앱을 실행하려면 Microsoft Edge WebView2 런타임이 필요해요.\n" +
                    "(Windows 11에는 기본으로 들어 있어요.)\n\n" +
                    "지금 다운로드 페이지를 열까요?\n" + RuntimeDownloadUrl,
                    AppTitle, MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (r == DialogResult.Yes) MainForm.ShellOpen(RuntimeDownloadUrl);
                return 0;
            }

            Application.Run(new MainForm());
            return 0;
        }
    }

    class MainForm : Form
    {
        const string VirtualHost = "curator.app";
        const string StartUrl = "https://curator.app/index.html";
        const string RemoteDataUrl = "https://metear0411-cyber.github.io/gamepass-curator/data/games.json";

        // 페이지가 games.json을 요청했을 때 최신 데이터 다운로드를 최대 이만큼 기다린다
        const int DataWaitMs = 4000;

        static readonly Color Background = Color.FromArgb(0x0b, 0x0c, 0x0b);

        // 앱에서는 서비스 워커가 필요 없고, 있으면 games.json 요청을 가로채 버린다 (app.js가 알아서 건너뛴다)
        const string DisableServiceWorkerScript =
            "try { delete Navigator.prototype.serviceWorker; } catch (e) {}";

        readonly WebView2 web;
        readonly string dataDir;
        readonly string webDir;
        readonly string cachedDataPath;
        Task<bool> updateTask;

        public MainForm()
        {
            dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GamepassCurator");
            webDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
            cachedDataPath = Path.Combine(dataDir, "games.json");

            SuspendLayout();
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(1400, 900);
            MinimumSize = new Size(640, 480);
            Text = Program.AppTitle;
            BackColor = Background;
            StartPosition = FormStartPosition.CenterScreen;
            try
            {
                using (Stream s = typeof(MainForm).Assembly.GetManifestResourceStream("GamepassCurator.app.ico"))
                {
                    if (s != null) Icon = new Icon(s);
                }
            }
            catch (Exception) { }

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = Background;
            Controls.Add(web);
            ResumeLayout(false);

            Load += OnLoad;
        }

        async void OnLoad(object sender, EventArgs e)
        {
            // 작은 화면이면 창이 화면 밖으로 넘치지 않게 최대화한다
            Rectangle area = Screen.FromControl(this).WorkingArea;
            if (Width > area.Width || Height > area.Height) WindowState = FormWindowState.Maximized;

            try
            {
                Directory.CreateDirectory(dataDir);
                Log("시작 " + Application.ProductVersion);

                // 최신 games.json은 페이지 로딩과 동시에 받아 둔다
                updateTask = Task.Run(new Func<bool>(DownloadLatestData));

                if (!File.Exists(Path.Combine(webDir, "index.html")))
                {
                    MessageBox.Show("앱 파일(web 폴더)을 찾을 수 없어요.\n압축을 풀었던 폴더 전체를 그대로 두고 실행해 주세요.\n\n" + webDir,
                        Program.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Close();
                    return;
                }

                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDir, "WebView2"), null);
                await web.EnsureCoreWebView2Async(env);
                CoreWebView2 core = web.CoreWebView2;

                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsZoomControlEnabled = true;

                // https://curator.app/* 요청은 전부 여기서 web 폴더 파일로 답한다.
                // (SetVirtualHostNameToFolderMapping을 쓰면 WebResourceRequested가 오지 않아
                //  games.json을 최신본으로 바꿔 끼울 수 없어서 직접 처리한다)
                core.AddWebResourceRequestedFilter("https://" + VirtualHost + "/*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += OnWebResourceRequested;
                core.NewWindowRequested += OnNewWindowRequested;
                core.NavigationStarting += OnNavigationStarting;
                core.LaunchingExternalUriScheme += OnLaunchingExternalUriScheme;
                await core.AddScriptToExecuteOnDocumentCreatedAsync(DisableServiceWorkerScript);

                core.Navigate(StartUrl);
            }
            catch (Exception ex)
            {
                Log("초기화 실패: " + ex);
                MessageBox.Show("화면을 준비하지 못했어요.\n\n" + ex.Message, Program.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        // ---- 링크 처리 ----

        static bool IsInternal(string uri)
        {
            Uri u;
            if (!Uri.TryCreate(uri, UriKind.Absolute, out u)) return true;
            if (u.Scheme == "about" || u.Scheme == "data" || u.Scheme == "blob") return true;
            return u.Scheme == Uri.UriSchemeHttps && string.Equals(u.Host, VirtualHost, StringComparison.OrdinalIgnoreCase);
        }

        void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (IsInternal(e.Uri)) return;
            e.Cancel = true;
            OpenExternal(e.Uri);
        }

        void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            if (IsInternal(e.Uri)) web.CoreWebView2.Navigate(e.Uri);
            else OpenExternal(e.Uri);
        }

        void OnLaunchingExternalUriScheme(object sender, CoreWebView2LaunchingExternalUriSchemeEventArgs e)
        {
            // NavigationStarting에서 대부분 처리되지만, 놓친 경우에도 확인 창 없이 연다
            e.Cancel = true;
            OpenExternal(e.Uri);
        }

        void OpenExternal(string uri)
        {
            Uri u;
            if (!Uri.TryCreate(uri, UriKind.Absolute, out u)) return;
            string scheme = u.Scheme.ToLowerInvariant();
            bool allowed = scheme == "http" || scheme == "https" || scheme == "mailto"
                || scheme == "msxbox" || scheme == "ms-windows-store" || scheme.StartsWith("ms-xbox");
            if (!allowed)
            {
                Log("열지 않은 링크: " + uri);
                return;
            }
            if (!ShellOpen(uri))
            {
                string msg = scheme == "msxbox" || scheme.StartsWith("ms-xbox")
                    ? "Xbox 앱을 열 수 없어요.\nMicrosoft Store에서 Xbox 앱을 설치한 뒤 다시 시도해 주세요."
                    : "링크를 열 수 없어요.\n\n" + uri;
                MessageBox.Show(this, msg, Program.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        public static bool ShellOpen(string uri)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(uri);
                psi.UseShellExecute = true;
                Process.Start(psi);
                return true;
            }
            catch (Exception ex)
            {
                Log("링크 열기 실패: " + uri + " / " + ex.Message);
                return false;
            }
        }

        // ---- 데이터 갱신 ----

        // 백그라운드 스레드에서 돈다. 받은 파일이 정상일 때만 캐시를 바꾼다.
        bool DownloadLatestData()
        {
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(RemoteDataUrl + "?t=" + DateTime.UtcNow.Ticks);
                req.Timeout = 15000;
                req.ReadWriteTimeout = 15000;
                req.UserAgent = "GamepassCurator-Desktop";
                req.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

                byte[] bytes;
                using (WebResponse resp = req.GetResponse())
                using (Stream s = resp.GetResponseStream())
                using (MemoryStream ms = new MemoryStream())
                {
                    s.CopyTo(ms);
                    bytes = ms.ToArray();
                }

                string gen = ReadGeneratedAt(bytes);
                string text = Encoding.UTF8.GetString(bytes);
                if (gen == null || text.IndexOf("\"games\"", StringComparison.Ordinal) < 0)
                {
                    Log("받은 games.json 형식이 이상해서 버림 (" + bytes.Length + " bytes)");
                    return false;
                }

                string tmp = cachedDataPath + ".tmp";
                File.WriteAllBytes(tmp, bytes);
                if (File.Exists(cachedDataPath)) File.Replace(tmp, cachedDataPath, null);
                else File.Move(tmp, cachedDataPath);
                Log("최신 데이터 받음: " + gen + " (" + bytes.Length + " bytes)");
                return true;
            }
            catch (Exception ex)
            {
                Log("최신 데이터 받기 실패 (내장 데이터 사용): " + ex.Message);
                return false;
            }
        }

        // ---- https://curator.app/ 파일 제공 ----

        void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            Uri u;
            if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out u)) return;

            // https://curator.app/proxy/* 는 파일이 아니라 Steam 프록시로 답한다
            if (u.AbsolutePath.StartsWith(SteamProxy.Prefix, StringComparison.Ordinal)) { ServeProxy(e, u); return; }

            string rel =Uri.UnescapeDataString(u.AbsolutePath).TrimStart('/');
            if (rel.Length == 0 || rel.EndsWith("/")) rel += "index.html";

            if (rel == "data/games.json") { ServeData(e); return; }

            try
            {
                string root = Path.GetFullPath(webDir).TrimEnd('\\') + "\\";
                string full = Path.GetFullPath(Path.Combine(root, rel.Replace('/', '\\')));
                if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    e.Response = MakeResponse(Encoding.UTF8.GetBytes("Not found"), 404, "Not Found", "text/plain; charset=utf-8");
                    return;
                }
                e.Response = MakeResponse(File.ReadAllBytes(full), 200, "OK", ContentType(full));
            }
            catch (Exception ex)
            {
                Log("파일 제공 실패: " + rel + " / " + ex.Message);
                e.Response = MakeResponse(Encoding.UTF8.GetBytes("Error"), 500, "Internal Server Error", "text/plain; charset=utf-8");
            }
        }

        // games.json: 내려받는 중이면 잠깐 기다렸다가 내장본/최신본 중 새것을 준다
        async void ServeData(CoreWebView2WebResourceRequestedEventArgs e)
        {
            CoreWebView2Deferral deferral = e.GetDeferral();
            string bundled = Path.Combine(webDir, "data", "games.json");
            try
            {
                if (updateTask != null) await Task.WhenAny(updateTask, Task.Delay(DataWaitMs));
                string path;
                try { path = PickDataFile(bundled); }
                catch (Exception) { path = bundled; }
                byte[] bytes;
                try { bytes = await Task.Run(() => File.ReadAllBytes(path)); }
                catch (Exception) { path = bundled; bytes = File.ReadAllBytes(bundled); }
                e.Response = MakeResponse(bytes, 200, "OK", "application/json; charset=utf-8");
                Log("games.json 제공: " + (path == cachedDataPath ? "내려받은 최신본" : "내장본"));
            }
            catch (Exception ex)
            {
                Log("games.json 제공 실패: " + ex.Message);
                e.Response = MakeResponse(Encoding.UTF8.GetBytes("Error"), 500, "Internal Server Error", "text/plain; charset=utf-8");
            }
            finally
            {
                deferral.Complete();
            }
        }

        // Steam 프록시: 네트워크 대기는 백그라운드에서 하고, 응답은 Deferral로 나중에 채운다
        async void ServeProxy(CoreWebView2WebResourceRequestedEventArgs e, Uri u)
        {
            CoreWebView2Deferral deferral = e.GetDeferral();
            string method = e.Request.Method;
            string path = u.AbsolutePath;
            string query = u.Query;
            try
            {
                ProxyResult r = await Task.Run(() => SteamProxy.Handle(method, path, query));
                e.Response = MakeResponse(r.Body, r.Status, r.Reason, SteamProxy.JsonContentType);
            }
            catch (Exception ex)
            {
                Log("프록시 응답 실패: " + path + " / " + ex.Message);
                try { e.Response = MakeResponse(SteamProxy.ErrorBody("프록시 처리 중 오류가 났어요"), 502, "Bad Gateway", SteamProxy.JsonContentType); }
                catch (Exception) { }
            }
            finally
            {
                deferral.Complete();
            }
        }

        CoreWebView2WebResourceResponse MakeResponse(byte[] body, int status, string reason, string contentType)
        {
            return web.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(body), status, reason,
                "Content-Type: " + contentType + "\r\nCache-Control: no-cache");
        }

        static string ContentType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": case ".htm": return "text/html; charset=utf-8";
                case ".js": case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".webmanifest": return "application/manifest+json; charset=utf-8";
                case ".txt": return "text/plain; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".webp": return "image/webp";
                case ".ico": return "image/x-icon";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                default: return "application/octet-stream";
            }
        }

        // 내장본과 내려받은 것 중 generatedAt이 더 최신인 쪽
        string PickDataFile(string bundled)
        {
            string cachedGen = File.Exists(cachedDataPath) ? ReadGeneratedAt(ReadHead(cachedDataPath)) : null;
            if (cachedGen == null) return bundled;
            string bundledGen = File.Exists(bundled) ? ReadGeneratedAt(ReadHead(bundled)) : null;
            if (bundledGen == null || string.CompareOrdinal(cachedGen, bundledGen) > 0) return cachedDataPath;
            return bundled;
        }

        static byte[] ReadHead(string path)
        {
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                byte[] buf = new byte[1024];
                int n = fs.Read(buf, 0, buf.Length);
                Array.Resize(ref buf, n);
                return buf;
            }
        }

        static readonly Regex GeneratedAtRe = new Regex("\"generatedAt\"\\s*:\\s*\"([^\"]+)\"");

        static string ReadGeneratedAt(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0) return null;
            int len = Math.Min(bytes.Length, 1024);
            string head = Encoding.UTF8.GetString(bytes, 0, len).TrimStart('﻿', ' ', '\r', '\n', '\t');
            if (!head.StartsWith("{")) return null;
            Match m = GeneratedAtRe.Match(head);
            return m.Success ? m.Groups[1].Value : null;
        }

        // ---- 로그 (%LOCALAPPDATA%\GamepassCurator\app.log) ----

        static readonly object LogLock = new object();

        internal static void Log(string line)
        {
            try
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GamepassCurator");
                string path = Path.Combine(dir, "app.log");
                lock (LogLock)
                {
                    Directory.CreateDirectory(dir);
                    if (File.Exists(path) && new FileInfo(path).Length > 256 * 1024) File.Delete(path);
                    File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + line + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch (Exception) { }
        }
    }

    // ---- 읽기 전용 Steam 프록시 (https://curator.app/proxy/*) ----
    // 브라우저에서는 CORS 때문에 Steam API를 직접 부를 수 없지만 exe 안에서는 이 프록시로 부를 수 있다.
    // 아래 세 가지 주소만 만들어 부르고(아무 주소나 대신 받아 주는 열린 프록시가 아님), 입력은 엄격하게 검사한다.
    //   GET /proxy/ping                     → {"ok":true,"version":"..."} (페이지가 exe 안인지 알아보는 용도)
    //   GET /proxy/steam-search?term=텍스트 → store.steampowered.com/api/storesearch
    //   GET /proxy/steamspy?appid=숫자      → steamspy.com/api.php?request=appdetails
    //   GET /proxy/steam-app?appid=숫자     → store.steampowered.com/api/appdetails
    // 받은 JSON은 손대지 않고 그대로 돌려준다. 실패하면 {"error":"..."}.

    sealed class ProxyResult
    {
        public int Status;
        public string Reason;
        public byte[] Body;
        public bool FromCache;
    }

    static class SteamProxy
    {
        public const string Prefix = "/proxy/";
        public const string JsonContentType = "application/json; charset=utf-8";

        const string UserAgent = "gamepass-curator-desktop";
        const int TimeoutMs = 10000;
        const int MaxBodyBytes = 4 * 1024 * 1024;
        const int TermMaxLength = 100;
        const int MaxCacheEntries = 500;
        static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

        static readonly Regex AppIdRe = new Regex("^[0-9]{1,10}$");

        // ---- 호출 간격 제한: 실패시키지 않고 차례가 올 때까지 기다린다 ----

        sealed class Gate
        {
            public readonly string Name;
            public readonly int IntervalMs;
            public long NextMs;
            public Gate(string name, int intervalMs) { Name = name; IntervalMs = intervalMs; }
        }

        static readonly Stopwatch Clock = Stopwatch.StartNew();
        static readonly Gate SteamSpyGate = new Gate("steamspy.com", 1100);
        static readonly Gate StoreGate = new Gate("store.steampowered.com", 1500);

        // 다음 빈 시각을 예약하고 그때까지 잔다 (여러 요청이 몰리면 순서대로 줄을 선다)
        static void WaitTurn(Gate g)
        {
            long wait;
            lock (g)
            {
                long now = Clock.ElapsedMilliseconds;
                long slot = Math.Max(now, g.NextMs);
                g.NextMs = slot + g.IntervalMs;
                wait = slot - now;
            }
            if (wait > 0) Thread.Sleep((int)wait);
        }

        // ---- 메모리 캐시 (10분) ----

        sealed class CacheEntry
        {
            public byte[] Body;
            public DateTime Expires;
        }

        static readonly Dictionary<string, CacheEntry> Cache = new Dictionary<string, CacheEntry>();
        static readonly object CacheLock = new object();

        static byte[] CacheGet(string key)
        {
            lock (CacheLock)
            {
                CacheEntry c;
                if (!Cache.TryGetValue(key, out c)) return null;
                if (c.Expires <= DateTime.UtcNow) { Cache.Remove(key); return null; }
                return c.Body;
            }
        }

        static void CachePut(string key, byte[] body)
        {
            lock (CacheLock)
            {
                DateTime now = DateTime.UtcNow;
                if (Cache.Count >= MaxCacheEntries)
                {
                    List<string> old = new List<string>();
                    foreach (KeyValuePair<string, CacheEntry> kv in Cache) if (kv.Value.Expires <= now) old.Add(kv.Key);
                    foreach (string k in old) Cache.Remove(k);
                    if (Cache.Count >= MaxCacheEntries) Cache.Clear();
                }
                CacheEntry c = new CacheEntry();
                c.Body = body;
                c.Expires = now + CacheTtl;
                Cache[key] = c;
            }
        }

        // ---- 요청 처리 (WebView2 핸들러와 --selftest가 같이 쓴다) ----

        // path: "/proxy/..." 형태의 AbsolutePath, query: Uri.Query ("?a=b" 또는 "")
        public static ProxyResult Handle(string method, string path, string query)
        {
            if (path == null || !path.StartsWith(Prefix, StringComparison.Ordinal))
                return Error(404, "Not Found", "알 수 없는 프록시 주소예요");
            string name = path.Substring(Prefix.Length);

            if (!string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase))
                return Error(405, "Method Not Allowed", "GET 요청만 받아요");

            if (name == "ping")
                return Ok(Encoding.UTF8.GetBytes("{\"ok\":true,\"version\":\"" + JsonEscape(Application.ProductVersion) + "\"}"), false);

            Dictionary<string, string> q = ParseQuery(query);
            if (q == null) return Error(400, "Bad Request", "쿼리 문자열이 올바르지 않아요");

            string url;
            Gate gate;
            string bad;
            string term;
            int appId;
            switch (name)
            {
                case "steam-search":
                    bad = ValidateTerm(Param(q, "term"), out term);
                    if (bad != null) return Error(400, "Bad Request", bad);
                    url = "https://store.steampowered.com/api/storesearch/?term=" + Uri.EscapeDataString(term) + "&cc=kr&l=koreana";
                    gate = StoreGate;
                    break;
                case "steamspy":
                    bad = ValidateAppId(Param(q, "appid"), out appId);
                    if (bad != null) return Error(400, "Bad Request", bad);
                    url = "https://steamspy.com/api.php?request=appdetails&appid=" + appId;
                    gate = SteamSpyGate;
                    break;
                case "steam-app":
                    bad = ValidateAppId(Param(q, "appid"), out appId);
                    if (bad != null) return Error(400, "Bad Request", bad);
                    url = "https://store.steampowered.com/api/appdetails?appids=" + appId + "&cc=kr&l=koreana&filters=basic,metacritic,genres";
                    gate = StoreGate;
                    break;
                default:
                    return Error(404, "Not Found", "알 수 없는 프록시 주소예요");
            }
            return FetchCached(url, gate);
        }

        static ProxyResult FetchCached(string url, Gate gate)
        {
            byte[] body = CacheGet(url);
            if (body != null) return Ok(body, true);
            try
            {
                WaitTurn(gate);
                // 기다리는 동안 같은 요청이 먼저 받아 왔을 수 있다
                body = CacheGet(url);
                if (body != null) return Ok(body, true);
                body = Download(url);
            }
            catch (Exception ex)
            {
                MainForm.Log("프록시 실패: " + url + " / " + ex.Message);
                return Error(502, "Bad Gateway", "Steam 데이터를 받지 못했어요: " + ex.Message);
            }
            CachePut(url, body);
            MainForm.Log("프록시 받음: " + url + " (" + body.Length + " bytes)");
            return Ok(body, false);
        }

        static byte[] Download(string url)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "GET";
            req.Timeout = TimeoutMs;
            req.ReadWriteTimeout = TimeoutMs;
            req.UserAgent = UserAgent;
            req.Accept = "application/json";
            req.AllowAutoRedirect = false;
            req.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

            byte[] bytes;
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            {
                int code = (int)resp.StatusCode;
                if (code < 200 || code > 299) throw new WebException("HTTP " + code);
                using (Stream s = resp.GetResponseStream())
                using (MemoryStream ms = new MemoryStream())
                {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = s.Read(buf, 0, buf.Length)) > 0)
                    {
                        if (ms.Length + n > MaxBodyBytes) throw new InvalidDataException("응답이 너무 커요");
                        ms.Write(buf, 0, n);
                    }
                    bytes = ms.ToArray();
                }
            }
            if (!LooksLikeJson(bytes)) throw new InvalidDataException("JSON이 아닌 응답이에요 (" + bytes.Length + " bytes)");
            return bytes;
        }

        // 맨 앞(BOM·공백 제외)이 { 또는 [ 인지만 본다. Steam이 제한에 걸리면 null이나 HTML을 주기 때문.
        static bool LooksLikeJson(byte[] b)
        {
            int i = 0;
            if (b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF) i = 3;
            while (i < b.Length && (b[i] == ' ' || b[i] == '\t' || b[i] == '\r' || b[i] == '\n')) i++;
            return i < b.Length && (b[i] == '{' || b[i] == '[');
        }

        // ---- 입력 검사 ----

        static string ValidateTerm(string raw, out string term)
        {
            term = null;
            if (raw == null) return "term이 필요해요";
            string t = raw.Trim();
            if (t.Length == 0) return "term이 비어 있어요";
            if (t.Length > TermMaxLength) return "term은 " + TermMaxLength + "자 이하여야 해요";
            foreach (char c in t)
            {
                if (char.IsControl(c)) return "term에 쓸 수 없는 문자가 있어요";
            }
            term = t;
            return null;
        }

        static string ValidateAppId(string raw, out int appId)
        {
            appId = 0;
            if (raw == null) return "appid가 필요해요";
            if (!AppIdRe.IsMatch(raw)) return "appid는 숫자만 쓸 수 있어요";
            if (!int.TryParse(raw, out appId) || appId <= 0) { appId = 0; return "appid 범위가 올바르지 않아요"; }
            return null;
        }

        // 같은 이름이 두 번 나오거나 디코딩이 안 되면 null
        static Dictionary<string, string> ParseQuery(string query)
        {
            Dictionary<string, string> q = new Dictionary<string, string>(StringComparer.Ordinal);
            if (string.IsNullOrEmpty(query)) return q;
            string s = query[0] == '?' ? query.Substring(1) : query;
            if (s.Length > 2048) return null;
            foreach (string part in s.Split('&'))
            {
                if (part.Length == 0) continue;
                int eq = part.IndexOf('=');
                string k, v;
                try
                {
                    k = Uri.UnescapeDataString((eq < 0 ? part : part.Substring(0, eq)).Replace('+', ' '));
                    v = eq < 0 ? "" : Uri.UnescapeDataString(part.Substring(eq + 1).Replace('+', ' '));
                }
                catch (Exception) { return null; }
                if (q.ContainsKey(k)) return null;
                q[k] = v;
            }
            return q;
        }

        static string Param(Dictionary<string, string> q, string key)
        {
            string v;
            return q.TryGetValue(key, out v) ? v : null;
        }

        // ---- 응답 만들기 ----

        static ProxyResult Ok(byte[] body, bool fromCache)
        {
            ProxyResult r = new ProxyResult();
            r.Status = 200;
            r.Reason = "OK";
            r.Body = body;
            r.FromCache = fromCache;
            return r;
        }

        static ProxyResult Error(int status, string reason, string message)
        {
            ProxyResult r = new ProxyResult();
            r.Status = status;
            r.Reason = reason;
            r.Body = ErrorBody(message);
            return r;
        }

        public static byte[] ErrorBody(string message)
        {
            return Encoding.UTF8.GetBytes("{\"error\":\"" + JsonEscape(message) + "\"}");
        }

        static string JsonEscape(string s)
        {
            if (s == null) return "";
            StringBuilder sb = new StringBuilder(s.Length + 8);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }

    // ---- --selftest: 창 없이 프록시 경로(검사·캐시·간격 제한 포함)를 실제로 돌려 본다 ----

    static class SelfTest
    {
        static int failures;

        public static int Run()
        {
            failures = 0;
            MainForm.Log("자체 점검 시작 " + Application.ProductVersion);

            Expect("ping", "ping", "", 200, "\"ok\":true", null);
            Expect("Steam 검색 'Persona 5 Royal'", "steam-search", "?term=Persona+5+Royal", 200, "\"id\":1687950", false);
            Expect("SteamSpy 1687950", "steamspy", "?appid=1687950", 200, "\"appid\":1687950", false);
            Expect("Steam 상세 1687950", "steam-app", "?appid=1687950", 200, "\"success\":true", false);

            // 같은 요청은 캐시에서 바로 나와야 한다 (인코딩만 다르게 해서 같은 upstream 주소로 모이는지도 본다)
            Expect("캐시 재사용 (검색)", "steam-search", "?term=Persona%205%20Royal", 200, "\"id\":1687950", true);
            Expect("캐시 재사용 (SteamSpy)", "steamspy", "?appid=1687950", 200, "\"appid\":1687950", true);

            // 입력 검사: 네트워크로 나가지 않고 바로 거절돼야 한다
            Expect("거절: term 101자", "steam-search", "?term=" + new string('a', 101), 400, "\"error\"", null);
            Expect("거절: term 없음", "steam-search", "", 400, "\"error\"", null);
            Expect("거절: appid 숫자 아님", "steamspy", "?appid=12a", 400, "\"error\"", null);
            Expect("거절: appid 음수", "steam-app", "?appid=-5", 400, "\"error\"", null);
            Expect("거절: appid 중복", "steam-app", "?appid=1&appid=2", 400, "\"error\"", null);
            Expect("거절: 모르는 주소", "evil", "?url=https://example.com", 404, "\"error\"", null);

            bool ok = failures == 0;
            MainForm.Log("자체 점검 " + (ok ? "통과" : "실패 " + failures + "건"));
            return ok ? 0 : 1;
        }

        // fromCache: null이면 따지지 않는다
        static void Expect(string label, string name, string query, int status, string mustContain, bool? fromCache)
        {
            Stopwatch sw = Stopwatch.StartNew();
            ProxyResult r;
            try { r = SteamProxy.Handle("GET", SteamProxy.Prefix + name, query); }
            catch (Exception ex)
            {
                failures++;
                MainForm.Log("점검 실패: " + label + " / 예외 " + ex.Message);
                return;
            }
            sw.Stop();

            string text = r.Body == null ? "" : Encoding.UTF8.GetString(r.Body);
            List<string> problems = new List<string>();
            if (r.Status != status) problems.Add("상태 " + r.Status + " (기대 " + status + ")");
            if (mustContain != null && text.IndexOf(mustContain, StringComparison.Ordinal) < 0) problems.Add("본문에 " + mustContain + " 없음");
            if (fromCache.HasValue && r.FromCache != fromCache.Value) problems.Add(fromCache.Value ? "캐시를 안 씀" : "캐시가 아닌데 캐시로 나옴");

            string info = r.Status + ", " + (r.Body == null ? 0 : r.Body.Length) + " bytes, " + sw.ElapsedMilliseconds + " ms" + (r.FromCache ? ", 캐시" : "");
            if (problems.Count == 0)
            {
                string detail = r.Status == 200 ? "" : " " + Shorten(text);
                MainForm.Log("점검 통과: " + label + " (" + info + ")" + detail);
            }
            else
            {
                failures++;
                MainForm.Log("점검 실패: " + label + " (" + info + ") " + string.Join(", ", problems.ToArray()) + " / " + Shorten(text));
            }
        }

        static string Shorten(string s)
        {
            s = s.Replace("\r", " ").Replace("\n", " ");
            return s.Length > 160 ? s.Substring(0, 160) + "…" : s;
        }
    }
}
