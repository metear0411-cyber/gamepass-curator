// 게임패스 큐레이터 데스크톱 앱
// docs/ 정적 웹앱을 WebView2로 띄우는 작은 WinForms 껍데기다.
// .NET Framework 4.x의 csc.exe(C# 5)로 빌드하므로 C# 6 이상 문법은 쓰지 않는다.
// 빌드: scripts\build-exe.ps1

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
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
        static void Main()
        {
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
                return;
            }

            Application.Run(new MainForm());
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
            string rel = Uri.UnescapeDataString(u.AbsolutePath).TrimStart('/');
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

        static void Log(string line)
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
}
