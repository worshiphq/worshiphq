// WorshipHQ Fingerprint Scanner Setup - one native Windows program that installs everything:
//   1. Python (only if the PC has no usable one)
//   2. the scanner helper + its Python package
//   3. the ZKTeco scanner driver (hosted next to the helper, checked by SHA-256, installed silently)
//   4. auto-start, then a real check that the helper answers and sees the scanner.
// Everything is logged to %LOCALAPPDATA%\WorshipHQ\Scanner\setup.log.
// Built with the C# compiler that ships with Windows (see build.ps1), so this stays C# 5 / .NET Framework 4.x.

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace WorshipHQ.ScannerSetup
{
    /// <summary>A problem the person can understand and act on. The message is shown in the window as is.</summary>
    class SetupException : Exception
    {
        public SetupException(string message) : base(message) { }
    }

    class ExecResult
    {
        public int Code;
        public string Out = "";
        public string Err = "";
        public bool TimedOut;
    }

    enum Outcome { Ready, ReplugNeeded }

    enum S { Pending, Active, Done, Warn, Failed }

    static class Cfg
    {
        public const string Site = "https://worshiphq.app/scanner-agent";
        public const string AgentUrl = Site + "/whq-scanner-agent.py";
        public const string DriverUrl = Site + "/zk-driver-setup.exe";
        // ZKTeco "Fingerprint Reader Standard Driver 5.3.0.33". Checked before it is run.
        public const string DriverSha256 = "10A420E2D7A3A7C73B5421638CC7A2A1A7D96D7BED4CC10C3AE9F43F75FAF877";
        public const string PythonUrl = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe";
        public const int AgentPort = 23847;

        /// <summary>The steps shown in the checklist, in order.</summary>
        public static readonly string[] StepNames = new[]
        {
            "Connect to WorshipHQ",
            "Python (the helper's engine)",
            "Scanner software",
            "Scanner driver",
            "Start and test your scanner",
        };

        public static readonly string InstallDir = Path.Combine(
            Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? Path.GetTempPath(), @"WorshipHQ\Scanner");
        public static readonly string AgentPath = Path.Combine(InstallDir, "whq-scanner-agent.py");
        public static readonly string LogPath = Path.Combine(InstallDir, "setup.log");
    }

    static class Log
    {
        static readonly object gate = new object();
        public static void Write(string msg)
        {
            try
            {
                lock (gate)
                {
                    Directory.CreateDirectory(Cfg.InstallDir);
                    File.AppendAllText(Cfg.LogPath, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + msg + Environment.NewLine);
                }
            }
            catch { }
        }
    }

    /// <summary>All the real work. Reports progress through OnMark/OnMessage and throws SetupException on failure.</summary>
    class Installer
    {
        /// <summary>(step index, state, short note shown at the right of the step)</summary>
        public Action<int, S, string> OnMark = delegate { };
        /// <summary>(sentence under the checklist, overall percent)</summary>
        public Action<string, int> OnMessage = delegate { };
        /// <summary>The step that is running now, so a failure can be pinned on it.</summary>
        public int Current;

        void Mark(int step, S state, string note)
        {
            if (state == S.Active) Current = step;
            Log.Write("step " + step + " " + state + (string.IsNullOrEmpty(note) ? "" : " - " + note));
            OnMark(step, state, note ?? "");
        }

        void Say(string text, int pct)
        {
            Log.Write(text);
            OnMessage(text, pct);
        }

        // ---------------------------------------------------------------- helpers

        /// <summary>Runs a program, waits, and returns its output. Never throws because the program wrote to stderr.</summary>
        public static ExecResult RunNative(string file, string args, int timeoutMs)
        {
            var res = new ExecResult();
            var so = new StringBuilder();
            var se = new StringBuilder();
            var psi = new ProcessStartInfo(file, args);
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            using (var p = new Process())
            {
                p.StartInfo = psi;
                p.OutputDataReceived += delegate (object s, DataReceivedEventArgs e) { if (e.Data != null) lock (so) so.AppendLine(e.Data); };
                p.ErrorDataReceived += delegate (object s, DataReceivedEventArgs e) { if (e.Data != null) lock (se) se.AppendLine(e.Data); };
                p.Start();
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
                if (!p.WaitForExit(timeoutMs))
                {
                    res.TimedOut = true;
                    try { p.Kill(); } catch { }
                    res.Code = -1;
                }
                else
                {
                    p.WaitForExit(); // flush the async output
                    res.Code = p.ExitCode;
                }
            }
            lock (so) res.Out = so.ToString();
            lock (se) res.Err = se.ToString();
            return res;
        }

        public static string Tail(string text, int n)
        {
            if (string.IsNullOrEmpty(text)) return "";
            var lines = new List<string>();
            foreach (var l in text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                if (l.Trim().Length > 0) lines.Add(l.Trim());
            int skip = Math.Max(0, lines.Count - n);
            return string.Join(" | ", lines.GetRange(skip, lines.Count - skip).ToArray());
        }

        static void Download(string url, string dest)
        {
            for (int i = 1; i <= 3; i++)
            {
                try
                {
                    Log.Write("download " + url + " (try " + i + ")");
                    var req = (HttpWebRequest)WebRequest.Create(url);
                    req.Timeout = 60000;
                    req.ReadWriteTimeout = 120000;
                    req.UserAgent = "WorshipHQ-Scanner-Setup";
                    using (var resp = req.GetResponse())
                    using (var s = resp.GetResponseStream())
                    using (var f = File.Create(dest))
                    {
                        s.CopyTo(f);
                    }
                    if (new FileInfo(dest).Length > 0) return;
                }
                catch (Exception ex)
                {
                    Log.Write("download failed: " + ex.Message);
                    Thread.Sleep(2000);
                }
            }
            throw new SetupException("Couldn't download a file the scanner needs. Check the internet connection and run setup again.");
        }

        static bool CanReachSite()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(Cfg.AgentUrl);
                req.Method = "HEAD";
                req.Timeout = 20000;
                using (var resp = req.GetResponse()) { return true; }
            }
            catch (Exception ex) { Log.Write("site check failed: " + ex.Message); return false; }
        }

        static string Sha256Of(string path)
        {
            using (var sha = SHA256.Create())
            using (var f = File.OpenRead(path))
            {
                var hash = sha.ComputeHash(f);
                var sb = new StringBuilder();
                foreach (var b in hash) sb.Append(b.ToString("X2"));
                return sb.ToString();
            }
        }

        // ---------------------------------------------------------------- Python

        public static bool TestPython(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            if (path.IndexOf("WindowsApps", StringComparison.OrdinalIgnoreCase) >= 0) return false; // the Microsoft Store stub, not real Python
            if (!File.Exists(path)) return false;
            try
            {
                var r = RunNative(path, "-c \"import sys; print(sys.version_info[0]*100+sys.version_info[1])\"", 30000);
                if (r.Code != 0) return false;
                int v;
                if (!int.TryParse(r.Out.Trim(), out v)) return false;
                return v >= 308 && v <= 313; // versions the scanner package supports
            }
            catch { return false; }
        }

        public static string FindPython()
        {
            var cands = new List<string>();
            string local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "";
            string pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? @"C:\Program Files";
            foreach (var v in new[] { "312", "313", "311", "310", "39" })
            {
                cands.Add(Path.Combine(local, @"Programs\Python\Python" + v + @"\python.exe"));
                cands.Add(Path.Combine(pf, "Python" + v + @"\python.exe"));
                cands.Add(@"C:\Python" + v + @"\python.exe");
            }
            foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                try
                {
                    using (var core = hive.OpenSubKey(@"SOFTWARE\Python\PythonCore"))
                    {
                        if (core == null) continue;
                        foreach (var ver in core.GetSubKeyNames())
                        {
                            using (var ip = core.OpenSubKey(ver + @"\InstallPath"))
                            {
                                if (ip == null) continue;
                                var exe = ip.GetValue("ExecutablePath") as string;
                                if (!string.IsNullOrEmpty(exe)) { cands.Add(exe); continue; }
                                var dir = ip.GetValue(null) as string;
                                if (!string.IsNullOrEmpty(dir)) cands.Add(Path.Combine(dir, "python.exe"));
                            }
                        }
                    }
                }
                catch { }
            }
            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (var dir in path.Split(';'))
            {
                try { if (dir.Trim().Length > 0) cands.Add(Path.Combine(dir.Trim(), "python.exe")); } catch { }
            }
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var c in cands)
            {
                if (!seen.Add(c)) continue;
                if (TestPython(c)) { Log.Write("python found: " + c); return c; }
            }
            Log.Write("no usable python found");
            return null;
        }

        // ---------------------------------------------------------------- driver and helper

        public static bool HasZkDriver()
        {
            string win = Environment.GetEnvironmentVariable("windir") ?? @"C:\Windows";
            return File.Exists(Path.Combine(win, @"System32\libzkfp.dll")) || File.Exists(Path.Combine(win, @"Sysnative\libzkfp.dll"));
        }

        /// <summary>The helper's /status answer as text, or null if it isn't running.</summary>
        public static string AgentStatus()
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Cfg.AgentPort + "/status");
                req.Timeout = 3000;
                using (var resp = req.GetResponse())
                using (var rd = new StreamReader(resp.GetResponseStream()))
                    return rd.ReadToEnd();
            }
            catch { return null; }
        }

        static bool IsConnected(string statusJson)
        {
            return statusJson != null && Regex.IsMatch(statusJson, "\"connected\"\\s*:\\s*true");
        }

        void InstallDriver()
        {
            Say("Downloading the scanner driver...", 56);
            string drv = Path.Combine(Path.GetTempPath(), "whq-zk-driver-setup.exe");
            Download(Cfg.DriverUrl, drv);
            if (!string.Equals(Sha256Of(drv), Cfg.DriverSha256, StringComparison.OrdinalIgnoreCase))
            {
                try { File.Delete(drv); } catch { }
                throw new SetupException("The scanner driver download was damaged. Please run setup again.");
            }

            Mark(3, S.Active, "Needs your OK");
            Say("Installing the scanner driver. Click Yes when Windows asks for permission.", 66);
            if (!RunElevated(drv, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-", "silent"))
                throw new SetupException("The scanner driver needs your permission. Run setup again and click Yes when Windows asks.");

            if (!HasZkDriver())
            {
                // Silent mode did not take; show the maker's own window instead of failing.
                Say("Finish the driver window that just opened (press Next, Install, Finish).", 70);
                RunElevated(drv, "", "window");
            }
            Thread.Sleep(2000);
            if (!HasZkDriver())
                throw new SetupException("The scanner driver didn't finish installing. Run setup again and click Yes when Windows asks.");
        }

        /// <summary>Starts a program as administrator (Windows shows its permission prompt) and waits. False if the person said no.</summary>
        static bool RunElevated(string file, string args, string label)
        {
            try
            {
                var psi = new ProcessStartInfo(file, args);
                psi.UseShellExecute = true;
                psi.Verb = "runas";
                using (var p = Process.Start(psi))
                {
                    p.WaitForExit(15 * 60 * 1000);
                    Log.Write("driver installer (" + label + ") exit " + (p.HasExited ? p.ExitCode.ToString() : "still running"));
                }
                return true;
            }
            catch (Win32Exception ex)
            {
                Log.Write("driver launch failed (" + label + "): " + ex.Message);
                return false; // 1223 = the person pressed No
            }
        }

        // ---------------------------------------------------------------- the whole install

        public Outcome Run()
        {
            Log.Write("---- setup started ----");
            Log.Write("Windows: " + Environment.OSVersion.VersionString + ", 64-bit OS: " + Environment.Is64BitOperatingSystem);
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            Directory.CreateDirectory(Cfg.InstallDir);

            // 0. Internet
            Mark(0, S.Active, "");
            Say("Checking the internet connection...", 4);
            if (!CanReachSite())
                throw new SetupException("Couldn't reach worshiphq.app. Please check the internet connection and run setup again.");
            Mark(0, S.Done, "Connected");

            // 1. Python
            Mark(1, S.Active, "Checking");
            Say("Checking for Python...", 10);
            string py = FindPython();
            if (py != null)
            {
                Mark(1, S.Done, "Already installed");
            }
            else
            {
                Mark(1, S.Active, "Installing, about a minute");
                Say("Installing Python. This happens once and takes about a minute.", 14);
                string pyExe = Path.Combine(Path.GetTempPath(), "whq-python-3.12.8-amd64.exe");
                Download(Cfg.PythonUrl, pyExe);
                Say("Installing Python. This happens once and takes about a minute.", 24);
                var r = RunNative(pyExe, "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=0 Include_test=0 Include_doc=0 Shortcuts=0", 15 * 60 * 1000);
                Log.Write("python installer exit " + r.Code + " " + Tail(r.Err, 3));
                Thread.Sleep(2000);
                py = FindPython();
                if (py == null)
                    throw new SetupException("Python could not be installed automatically. Send the setup log to WorshipHQ support.");
                Mark(1, S.Done, "Installed");
            }
            string pyw = Path.Combine(Path.GetDirectoryName(py), "pythonw.exe");
            if (!File.Exists(pyw)) pyw = py;

            // 2. Scanner helper + package
            Mark(2, S.Active, "Downloading");
            Say("Downloading the scanner helper...", 36);
            try { Download(Cfg.AgentUrl, Cfg.AgentPath); }
            catch (SetupException) { if (!File.Exists(Cfg.AgentPath)) throw; Log.Write("using the helper already on this PC"); }

            Mark(2, S.Active, "Installing");
            Say("Installing the scanner software...", 44);
            var up = RunNative(py, "-m pip install --disable-pip-version-check --no-warn-script-location --upgrade pip", 10 * 60 * 1000);
            Log.Write("pip upgrade exit " + up.Code); // not fatal: an old pip is fine
            ExecResult pr = null;
            bool ok = false;
            for (int i = 1; i <= 2 && !ok; i++)
            {
                pr = RunNative(py, "-m pip install --disable-pip-version-check --no-warn-script-location pyzkfp", 10 * 60 * 1000);
                Log.Write("pip pyzkfp try " + i + " exit " + pr.Code + " " + Tail(pr.Err, 4));
                ok = pr.Code == 0;
            }
            if (!ok) throw new SetupException("Couldn't install the scanner software: " + Tail(pr.Err, 2));
            Mark(2, S.Done, "Installed");

            // 3. ZKTeco driver
            Mark(3, S.Active, "Checking");
            if (HasZkDriver())
            {
                Log.Write("ZKTeco driver already present");
                Mark(3, S.Done, "Already installed");
            }
            else
            {
                Mark(3, S.Active, "Downloading");
                InstallDriver();
                Mark(3, S.Done, "Installed");
            }

            // 4. Start the helper (hidden), register auto-start, and look for the scanner
            Mark(4, S.Active, "Starting");
            Say("Starting the scanner helper...", 84);
            var inst = RunNative(py, "\"" + Cfg.AgentPath + "\" --install", 60000);
            Log.Write("agent --install exit " + inst.Code + " " + Tail(inst.Out, 2));
            string st = AgentStatus();
            if (st == null)
            {
                var psi = new ProcessStartInfo(pyw, "\"" + Cfg.AgentPath + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                for (int i = 0; i < 40 && st == null; i++) { Thread.Sleep(500); st = AgentStatus(); }
            }
            if (st == null)
                throw new SetupException("The scanner helper didn't start. Details are in the setup folder (agent.log).");

            Mark(4, S.Active, "Looking for the scanner");
            Say("Looking for your scanner...", 92);
            for (int i = 0; i < 24 && !IsConnected(st); i++)
            {
                Thread.Sleep(500);
                var again = AgentStatus();
                if (again != null) st = again;
            }
            Log.Write("final status: " + st);
            if (IsConnected(st)) { Mark(4, S.Done, "Scanner found"); return Outcome.Ready; }
            Mark(4, S.Warn, "Scanner not seen yet");
            return Outcome.ReplugNeeded;
        }
    }

    // ==================================================================== window

    /// <summary>A panel that repaints without flicker.</summary>
    class CanvasPanel : Panel
    {
        public CanvasPanel()
        {
            DoubleBuffered = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }
    }

    class SetupForm : Form
    {
        static readonly Color Page = Color.FromArgb(246, 244, 239);
        static readonly Color White = Color.White;
        static readonly Color Navy = Color.FromArgb(20, 57, 120);
        static readonly Color Gold = Color.FromArgb(201, 143, 38);
        static readonly Color Ink = Color.FromArgb(33, 37, 46);
        static readonly Color Mute = Color.FromArgb(116, 120, 130);
        static readonly Color Faint = Color.FromArgb(205, 208, 214);
        static readonly Color Line = Color.FromArgb(230, 226, 218);
        static readonly Color Green = Color.FromArgb(21, 150, 107);
        static readonly Color Red = Color.FromArgb(214, 48, 48);

        public static bool PreviewOnly;

        readonly CanvasPanel header = new CanvasPanel();
        readonly CanvasPanel steps = new CanvasPanel();
        readonly CanvasPanel bar = new CanvasPanel();
        readonly Label title = new Label();
        readonly Label sub = new Label();
        readonly Label message = new Label();
        readonly Label detail = new Label();
        readonly Button btn = new Button();
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        Image logo;

        readonly S[] state = new S[Cfg.StepNames.Length];
        readonly string[] note = new string[Cfg.StepNames.Length];
        int percent;
        int spin;
        bool finished;
        bool failed;

        public SetupForm()
        {
            Text = "WorshipHQ Fingerprint Setup";
            ClientSize = new Size(560, 576);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            BackColor = Page;
            ForeColor = Ink;
            Font = new Font("Segoe UI", 10);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            for (int i = 0; i < note.Length; i++) note[i] = "";
            try
            {
                using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("Logo.png"))
                    if (s != null) logo = Image.FromStream(s);
            }
            catch { }

            // White header carrying the logo (the logo file has a white background).
            header.Location = new Point(0, 0);
            header.Size = new Size(560, 128);
            header.BackColor = White;
            header.Paint += PaintHeader;
            Controls.Add(header);

            title.Text = "Setting up your fingerprint scanner";
            title.Font = new Font("Segoe UI Semibold", 16);
            title.ForeColor = Navy;
            title.TextAlign = ContentAlignment.MiddleCenter;
            title.Location = new Point(30, 148);
            title.Size = new Size(500, 34);
            Controls.Add(title);

            sub.Text = "Everything is installed for you. Please keep this window open.";
            sub.ForeColor = Mute;
            sub.Font = new Font("Segoe UI", 9.5f);
            sub.TextAlign = ContentAlignment.MiddleCenter;
            sub.Location = new Point(30, 184);
            sub.Size = new Size(500, 22);
            Controls.Add(sub);

            steps.Location = new Point(50, 222);
            steps.Size = new Size(460, 196);
            steps.BackColor = Page;
            steps.Paint += PaintSteps;
            Controls.Add(steps);

            bar.Location = new Point(50, 432);
            bar.Size = new Size(460, 8);
            bar.BackColor = Page;
            bar.Paint += PaintBar;
            Controls.Add(bar);

            message.Text = "Getting started...";
            message.ForeColor = Ink;
            message.TextAlign = ContentAlignment.MiddleCenter;
            message.Location = new Point(40, 452);
            message.Size = new Size(480, 44);
            Controls.Add(message);

            detail.Font = new Font("Segoe UI", 8);
            detail.ForeColor = Mute;
            detail.TextAlign = ContentAlignment.MiddleCenter;
            detail.Location = new Point(30, 494);
            detail.Size = new Size(500, 18);
            Controls.Add(detail);

            btn.Text = "Please wait...";
            btn.Enabled = false;
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderSize = 0;
            btn.BackColor = Faint;
            btn.ForeColor = White;
            btn.Font = new Font("Segoe UI Semibold", 10.5f);
            btn.Size = new Size(240, 42);
            btn.Location = new Point(160, 516);
            btn.Cursor = Cursors.Hand;
            using (var rp = Rounded(new Rectangle(0, 0, btn.Width, btn.Height), 10)) btn.Region = new Region(rp);
            btn.Click += delegate { Close(); };
            Controls.Add(btn);

            timer.Interval = 70;
            timer.Tick += delegate { spin = (spin + 14) % 360; steps.Invalidate(); };
            timer.Start();

            Shown += delegate
            {
                if (PreviewOnly) return;
                var t = new Thread(Work);
                t.IsBackground = true;
                t.Start();
            };
        }

        // ---------------------------------------------------------------- painting

        void PaintHeader(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            if (logo != null)
            {
                int w = 380, h = (int)(w * (double)logo.Height / logo.Width);
                g.DrawImage(logo, (header.Width - w) / 2, (header.Height - h) / 2, w, h);
            }
            using (var p = new Pen(Line)) g.DrawLine(p, 0, header.Height - 1, header.Width, header.Height - 1);
            using (var b = new SolidBrush(Gold)) g.FillRectangle(b, 0, header.Height - 3, header.Width, 3);
        }

        void PaintSteps(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            int rowH = 38;
            using (var nameFont = new Font("Segoe UI", 10.5f))
            using (var activeFont = new Font("Segoe UI Semibold", 10.5f))
            using (var noteFont = new Font("Segoe UI", 9f))
            {
                for (int i = 0; i < state.Length; i++)
                {
                    int y = i * rowH;
                    Rectangle card = new Rectangle(0, y + 2, steps.Width - 1, rowH - 6);
                    if (state[i] == S.Active)
                    {
                        using (var path = Rounded(card, 8))
                        {
                            using (var b = new SolidBrush(White)) g.FillPath(b, path);
                            using (var p = new Pen(Line)) g.DrawPath(p, path);
                        }
                    }
                    DrawIcon(g, state[i], 22, y + rowH / 2 - 1);

                    Color nameCol = state[i] == S.Pending ? Mute : Ink;
                    var f = state[i] == S.Active ? activeFont : nameFont;
                    TextRenderer.DrawText(g, Cfg.StepNames[i], f, new Point(44, y + 7), nameCol, TextFormatFlags.NoPadding);

                    string n = note[i];
                    if (!string.IsNullOrEmpty(n))
                    {
                        Color nc = state[i] == S.Done ? Green : (state[i] == S.Failed ? Red : (state[i] == S.Warn ? Gold : Navy));
                        var size = TextRenderer.MeasureText(g, n, noteFont, new Size(300, 20), TextFormatFlags.NoPadding);
                        TextRenderer.DrawText(g, n, noteFont, new Point(steps.Width - size.Width - 12, y + 9), nc, TextFormatFlags.NoPadding);
                    }
                }
            }
        }

        void DrawIcon(Graphics g, S s, int cx, int cy)
        {
            int r = 10;
            var box = new Rectangle(cx - r, cy - r, r * 2, r * 2);
            switch (s)
            {
                case S.Pending:
                    using (var p = new Pen(Faint, 2)) g.DrawEllipse(p, box);
                    break;
                case S.Active:
                    using (var p = new Pen(Color.FromArgb(40, Navy), 2.5f)) g.DrawEllipse(p, box);
                    using (var p = new Pen(Navy, 2.5f)) { p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; g.DrawArc(p, box, spin, 100); }
                    break;
                case S.Done:
                    using (var b = new SolidBrush(Green)) g.FillEllipse(b, box);
                    using (var p = new Pen(White, 2.4f)) { p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; p.LineJoin = LineJoin.Round; g.DrawLines(p, new[] { new Point(cx - 5, cy), new Point(cx - 1, cy + 4), new Point(cx + 5, cy - 4) }); }
                    break;
                case S.Warn:
                    using (var b = new SolidBrush(Gold)) g.FillEllipse(b, box);
                    using (var p = new Pen(White, 2.4f)) { p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; g.DrawLine(p, cx, cy - 5, cx, cy + 1); g.DrawLine(p, cx, cy + 5, cx, cy + 5); }
                    break;
                case S.Failed:
                    using (var b = new SolidBrush(Red)) g.FillEllipse(b, box);
                    using (var p = new Pen(White, 2.4f)) { p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; g.DrawLine(p, cx - 4, cy - 4, cx + 4, cy + 4); g.DrawLine(p, cx + 4, cy - 4, cx - 4, cy + 4); }
                    break;
            }
        }

        void PaintBar(object sender, PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var track = new Rectangle(0, 0, bar.Width - 1, bar.Height - 1);
            using (var path = Rounded(track, 4))
            using (var b = new SolidBrush(Line)) g.FillPath(b, path);
            int w = (int)((bar.Width - 1) * Math.Max(0, Math.Min(100, percent)) / 100.0);
            if (w > 8)
            {
                Color fill = failed ? Red : (finished ? Green : Navy);
                using (var path = Rounded(new Rectangle(0, 0, w, bar.Height - 1), 4))
                using (var b = new SolidBrush(fill)) g.FillPath(b, path);
            }
        }

        static GraphicsPath Rounded(Rectangle r, int radius)
        {
            int d = radius * 2;
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        // ---------------------------------------------------------------- the run

        void UI(MethodInvoker action)
        {
            if (IsDisposed) return;
            try { BeginInvoke(action); } catch { }
        }

        void SetButton(string text, Color back)
        {
            btn.Text = text;
            btn.BackColor = back;
            btn.ForeColor = White;
            btn.Enabled = true;
        }

        void Work()
        {
            var inst = new Installer();
            inst.OnMark = delegate (int i, S s, string n)
            {
                UI(delegate { state[i] = s; note[i] = n; steps.Invalidate(); });
            };
            inst.OnMessage = delegate (string text, int pct)
            {
                UI(delegate { message.Text = text; percent = pct; bar.Invalidate(); });
            };
            try
            {
                Outcome outcome = inst.Run();
                UI(delegate
                {
                    finished = true;
                    percent = 100;
                    bar.Invalidate();
                    timer.Stop();
                    steps.Invalidate();
                    if (outcome == Outcome.Ready)
                    {
                        title.Text = "You're all set";
                        message.Text = "Your scanner is ready. It runs quietly in the background whenever this computer is on.";
                    }
                    else
                    {
                        title.Text = "Installed - one last step";
                        message.Text = "Unplug the scanner and plug it back in, then press Retry on the WorshipHQ page.";
                    }
                    sub.Text = "";
                    SetButton("Done - back to WorshipHQ", Navy);
                });
            }
            catch (Exception ex)
            {
                Log.Write("FAILED: " + ex);
                string msg = ex is SetupException ? ex.Message : "Something unexpected went wrong: " + ex.Message;
                int at = inst.Current;
                UI(delegate
                {
                    failed = true;
                    timer.Stop();
                    state[at] = S.Failed;
                    note[at] = "Stopped here";
                    steps.Invalidate();
                    bar.Invalidate();
                    title.Text = "Setup couldn't finish";
                    title.ForeColor = Red;
                    sub.Text = "";
                    message.ForeColor = Red;
                    message.Text = msg;
                    detail.Text = "Details: " + Cfg.LogPath;
                    SetButton("Close", Navy);
                });
            }
        }

        /// <summary>Fills the window with sample progress so the layout can be checked without installing anything.</summary>
        public void ShowDemo(string kind)
        {
            Shown += delegate { };
            state[0] = S.Done; note[0] = "Connected";
            state[1] = S.Done; note[1] = "Already installed";
            state[2] = S.Done; note[2] = "Installed";
            if (kind == "run")
            {
                state[3] = S.Active; note[3] = "Needs your OK";
                percent = 66; message.Text = "Installing the scanner driver. Click Yes when Windows asks for permission.";
            }
            else if (kind == "done")
            {
                state[3] = S.Done; note[3] = "Installed";
                state[4] = S.Done; note[4] = "Scanner found";
                percent = 100; finished = true; title.Text = "You're all set"; sub.Text = "";
                message.Text = "Your scanner is ready. It runs quietly in the background whenever this computer is on.";
                SetButton("Done - back to WorshipHQ", Navy);
            }
            else
            {
                state[3] = S.Failed; note[3] = "Stopped here";
                percent = 66; failed = true; title.Text = "Setup couldn't finish"; title.ForeColor = Red; sub.Text = "";
                message.ForeColor = Red;
                message.Text = "The scanner driver needs your permission. Run setup again and click Yes when Windows asks.";
                detail.Text = "Details: " + Cfg.LogPath;
                SetButton("Close", Navy);
            }
            timer.Stop();
        }
    }

    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            // Quiet self-check used when building: no window, no installs, writes a report file.
            if (args.Length >= 2 && args[0] == "--selftest")
            {
                var sb = new StringBuilder();
                string py = Installer.FindPython();
                sb.AppendLine("python=" + (py ?? "none"));
                sb.AppendLine("store-stub-rejected=" + (!Installer.TestPython(@"C:\Users\x\AppData\Local\Microsoft\WindowsApps\python.exe")));
                sb.AppendLine("zk-driver=" + Installer.HasZkDriver());
                var r = Installer.RunNative("cmd.exe", "/c where nopython_xyz", 20000);
                sb.AppendLine("where-notfound exit=" + r.Code + " err=" + Installer.Tail(r.Err, 1));
                var r2 = Installer.RunNative("cmd.exe", "/c echo warn 1>&2 & exit 0", 20000);
                sb.AppendLine("stderr-exit0 exit=" + r2.Code + " err=" + Installer.Tail(r2.Err, 1));
                sb.AppendLine("agent-status=" + (Installer.AgentStatus() ?? "not running"));
                File.WriteAllText(args[1], sb.ToString());
                return 0;
            }

            // Draws the window to a PNG without installing anything: --preview <png> [run|done|fail]
            if (args.Length >= 2 && args[0] == "--preview")
            {
                SetupForm.PreviewOnly = true;
                Application.EnableVisualStyles();
                using (var f = new SetupForm())
                {
                    f.StartPosition = FormStartPosition.Manual;
                    f.Location = new Point(40, 40);
                    f.ShowDemo(args.Length >= 3 ? args[2] : "run");
                    f.Show();
                    for (int i = 0; i < 20; i++) { Application.DoEvents(); Thread.Sleep(50); }
                    using (var bmp = new Bitmap(f.Width, f.Height))
                    {
                        f.DrawToBitmap(bmp, new Rectangle(0, 0, bmp.Width, bmp.Height));
                        bmp.Save(args[1], System.Drawing.Imaging.ImageFormat.Png);
                    }
                }
                return 0;
            }

            bool first;
            using (var mutex = new Mutex(true, @"Local\WorshipHQ-Scanner-Setup", out first))
            {
                if (!first)
                {
                    MessageBox.Show("Scanner setup is already running.", "WorshipHQ Setup");
                    return 0;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new SetupForm());
            }
            return 0;
        }
    }
}
