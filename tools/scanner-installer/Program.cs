// WorshipHQ Fingerprint Scanner Setup - one native Windows program that installs everything:
//   1. the scanner engine: a ready-made Python with the scanner package, one ~12 MB download unzipped in place
//      (falls back to installing Python from python.org plus pip only if that download fails)
//   2. the scanner helper
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
using System.IO.Compression;
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
        // Python 3.12.8 (embeddable) with pythonnet and pyzkfp already inside. Rebuild with tools/scanner-installer/build-runtime.ps1.
        public const string RuntimeUrl = Site + "/whq-scanner-runtime.zip";
        public const string RuntimeSha256 = "760F87ADCD64BBB0FECCB609D814EB6F11CFA167DDE68AAFA13D3BC98AFC676A";
        public const string PythonUrl = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe";
        public const int AgentPort = 23847;

        /// <summary>The steps shown in the checklist, in order.</summary>
        public static readonly string[] StepNames = new[]
        {
            "Connect to WorshipHQ",
            "Scanner engine",
            "Scanner helper",
            "Scanner driver",
            "Start and test your scanner",
        };

        public static readonly string InstallDir = Path.Combine(
            Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? Path.GetTempPath(), @"WorshipHQ\Scanner");
        public static readonly string AgentPath = Path.Combine(InstallDir, "whq-scanner-agent.py");
        public static readonly string LogPath = Path.Combine(InstallDir, "setup.log");
        public static readonly string RuntimeDir = Path.Combine(InstallDir, "runtime");
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
        /// <summary>The sentence under the checklist.</summary>
        public Action<string> OnMessage = delegate { };
        /// <summary>(step index, percent of that step done)</summary>
        public Action<int, int> OnStepPct = delegate { };
        /// <summary>The step that is running now, so a failure can be pinned on it.</summary>
        public int Current;

        void Mark(int step, S state, string note)
        {
            if (state == S.Active) Current = step;
            Log.Write("step " + step + " " + state + (string.IsNullOrEmpty(note) ? "" : " - " + note));
            OnMark(step, state, note ?? "");
        }

        /// <summary>Changes only the short note beside the running step (not logged; used for live MB counts).</summary>
        void Note(int step, string note)
        {
            OnMark(step, S.Active, note);
        }

        void Say(string text)
        {
            Log.Write(text);
            OnMessage(text);
        }

        void Pct(int step, int pct)
        {
            OnStepPct(step, Math.Max(0, Math.Min(100, pct)));
        }

        /// <summary>Moves a step's percentage from <paramref name="from"/> towards <paramref name="to"/> while something
        /// with no real progress runs (an installer, a wait). Close to <paramref name="to"/> after about expectedMs, never past it.</summary>
        Creeper Creep(int step, int from, int to, int expectedMs)
        {
            return new Creeper(delegate (int p) { Pct(step, p); }, from, to, expectedMs);
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
            Download(url, dest, null);
        }

        /// <summary>Downloads with up to 3 tries. progress gets (bytes so far, total bytes or -1).</summary>
        static void Download(string url, string dest, Action<long, long> progress)
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
                        long total = resp.ContentLength, got = 0;
                        var buf = new byte[65536];
                        int n, lastTick = 0;
                        while ((n = s.Read(buf, 0, buf.Length)) > 0)
                        {
                            f.Write(buf, 0, n);
                            got += n;
                            if (progress != null && Environment.TickCount - lastTick > 120) { lastTick = Environment.TickCount; progress(got, total); }
                        }
                        if (progress != null) progress(got, total);
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

        public static string Sha256Of(string path)
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

        // ---------------------------------------------------------------- scanner engine

        /// <summary>True if this Python can load the scanner package (pythonnet + pyzkfp).</summary>
        public static bool EngineWorks(string py)
        {
            if (string.IsNullOrEmpty(py) || !File.Exists(py)) return false;
            var r = RunNative(py, "-c \"import clr, pyzkfp\"", 90000);
            if (r.Code != 0) Log.Write("engine check failed for " + py + ": " + Tail(r.Err, 2));
            return r.Code == 0;
        }

        /// <summary>The ready-made engines unpacked by earlier runs, newest first.</summary>
        static List<string> EngineCandidates()
        {
            var list = new List<string>();
            try
            {
                var dirs = new List<DirectoryInfo>(new DirectoryInfo(Cfg.InstallDir).GetDirectories("runtime*"));
                dirs.Sort(delegate (DirectoryInfo a, DirectoryInfo b) { return b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc); });
                foreach (var d in dirs)
                {
                    if (d.Name.EndsWith(".new", StringComparison.OrdinalIgnoreCase)) continue;
                    string exe = Path.Combine(d.FullName, "python.exe");
                    if (File.Exists(exe)) list.Add(exe);
                }
            }
            catch { }
            return list;
        }

        /// <summary>Unpacks a zip into a folder, reporting (files done, files in total) as it goes.</summary>
        public static void Unzip(string zip, string folder, Action<int, int> progress)
        {
            string root = Path.GetFullPath(folder) + Path.DirectorySeparatorChar;
            using (var archive = ZipFile.OpenRead(zip))
            {
                int done = 0, count = archive.Entries.Count;
                foreach (var entry in archive.Entries)
                {
                    string dest = Path.GetFullPath(Path.Combine(folder, entry.FullName));
                    if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue; // never write outside the folder
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(dest); }
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        using (var es = entry.Open())
                        using (var fs = File.Create(dest)) es.CopyTo(fs);
                    }
                    done++;
                    if (progress != null && (done % 5 == 0 || done == count)) progress(done, count);
                }
            }
        }

        /// <summary>Downloads the ready-made engine, checks it, and unzips it. Returns its python.exe, or null if anything went wrong.</summary>
        string InstallEngine()
        {
            string zip = Path.Combine(Path.GetTempPath(), "whq-scanner-runtime.zip");
            try
            {
                Mark(1, S.Active, "Downloading");
                Say("Downloading the scanner engine (about 12 MB, one time only)...");
                Download(Cfg.RuntimeUrl, zip, delegate (long got, long total)
                {
                    if (total > 0)
                    {
                        Pct(1, (int)(got * 85 / total));
                        Note(1, string.Format("{0:0.0} of {1:0.0} MB", got / 1048576.0, total / 1048576.0));
                    }
                });
                if (!string.Equals(Sha256Of(zip), Cfg.RuntimeSha256, StringComparison.OrdinalIgnoreCase))
                {
                    Log.Write("engine download failed its checksum");
                    return null;
                }

                Mark(1, S.Active, "Unpacking");
                Say("Unpacking the scanner engine...");
                string fresh = Cfg.RuntimeDir + ".new";
                if (Directory.Exists(fresh)) Directory.Delete(fresh, true);
                Unzip(zip, fresh, delegate (int done, int count) { Pct(1, 85 + done * 12 / Math.Max(1, count)); });

                // Swap it in. If an older engine is in use (the helper is running from it), keep that one and use a new folder.
                string target = Cfg.RuntimeDir;
                if (Directory.Exists(target))
                {
                    try { Directory.Delete(target, true); }
                    catch (Exception ex) { Log.Write("old engine busy: " + ex.Message); target = Cfg.RuntimeDir + "-" + DateTime.Now.ToString("yyyyMMddHHmmss"); }
                }
                Directory.Move(fresh, target);
                Directory.SetLastWriteTimeUtc(target, DateTime.UtcNow);

                string py = Path.Combine(target, "python.exe");
                Mark(1, S.Active, "Checking");
                if (!EngineWorks(py)) return null;
                return py;
            }
            catch (Exception ex)
            {
                Log.Write("engine install failed: " + ex.Message);
                return null;
            }
            finally
            {
                try { File.Delete(zip); } catch { }
            }
        }

        /// <summary>The slower way, used only if the ready-made engine can't be downloaded: Python from python.org, then pip.</summary>
        string InstallEngineTheLongWay()
        {
            Log.Write("falling back to python.org + pip");
            string py = FindPython();
            if (py == null)
            {
                Mark(1, S.Active, "Installing Python");
                Say("Installing Python. This happens once and takes a few minutes.");
                string pyExe = Path.Combine(Path.GetTempPath(), "whq-python-3.12.8-amd64.exe");
                Download(Cfg.PythonUrl, pyExe, delegate (long got, long total) { if (total > 0) Pct(1, (int)(got * 35 / total)); });
                ExecResult r;
                using (Creep(1, 35, 70, 120000))
                    r = RunNative(pyExe, "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=0 Include_test=0 Include_doc=0 Shortcuts=0", 15 * 60 * 1000);
                Log.Write("python installer exit " + r.Code + " " + Tail(r.Err, 3));
                Thread.Sleep(2000);
                py = FindPython();
                if (py == null)
                    throw new SetupException("The scanner engine could not be installed. Check the internet connection and run setup again.");
            }
            Pct(1, 70);
            Mark(1, S.Active, "Installing");
            Say("Installing the scanner engine...");
            ExecResult pr = null;
            bool ok = false;
            using (Creep(1, 70, 98, 90000))
            {
                for (int i = 1; i <= 2 && !ok; i++)
                {
                    pr = RunNative(py, "-m pip install --disable-pip-version-check --no-warn-script-location pyzkfp", 10 * 60 * 1000);
                    Log.Write("pip pyzkfp try " + i + " exit " + pr.Code + " " + Tail(pr.Err, 4));
                    ok = pr.Code == 0;
                }
            }
            if (!ok) throw new SetupException("Couldn't install the scanner engine: " + Tail(pr.Err, 2));
            return py;
        }

        // ---------------------------------------------------------------- driver

        void InstallDriver()
        {
            Say("Downloading the scanner driver (about 13 MB, one time only)...");
            string drv = Path.Combine(Path.GetTempPath(), "whq-zk-driver-setup.exe");
            Download(Cfg.DriverUrl, drv, delegate (long got, long total)
            {
                if (total > 0)
                {
                    Pct(3, (int)(got * 55 / total));
                    Note(3, string.Format("{0:0.0} of {1:0.0} MB", got / 1048576.0, total / 1048576.0));
                }
            });
            if (!string.Equals(Sha256Of(drv), Cfg.DriverSha256, StringComparison.OrdinalIgnoreCase))
            {
                try { File.Delete(drv); } catch { }
                throw new SetupException("The scanner driver download was damaged. Please run setup again.");
            }

            Pct(3, 55);
            Mark(3, S.Active, "Needs your OK");
            Say("Installing the scanner driver. Click Yes when Windows asks for permission.");
            bool allowed;
            using (Creep(3, 55, 96, 45000))
                allowed = RunElevated(drv, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-", "silent");
            if (!allowed)
                throw new SetupException("The scanner driver needs your permission. Run setup again and click Yes when Windows asks.");

            if (!HasZkDriver())
            {
                // Silent mode did not take; show the maker's own window instead of failing.
                Say("Finish the driver window that just opened (press Next, Install, Finish).");
                RunElevated(drv, "", "window");
            }
            Thread.Sleep(1500);
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
            Say("Checking the internet connection...");
            bool online;
            using (Creep(0, 0, 95, 2500)) online = CanReachSite();
            if (!online)
                throw new SetupException("Couldn't reach worshiphq.app. Please check the internet connection and run setup again.");
            Pct(0, 100);
            Mark(0, S.Done, "Connected");

            // 1. Scanner engine: one we unpacked before, a Python that already has the scanner package, or download the ready-made one.
            Mark(1, S.Active, "Checking");
            Say("Checking for the scanner engine...");
            string py = null;
            using (Creep(1, 0, 30, 8000))
            {
                foreach (var c in EngineCandidates()) { if (EngineWorks(c)) { py = c; break; } }
                if (py == null) { var found = FindPython(); if (found != null && EngineWorks(found)) py = found; }
            }
            if (py != null)
            {
                Log.Write("engine found: " + py);
                Pct(1, 100);
                Mark(1, S.Done, "Already installed");
            }
            else
            {
                Pct(1, 0);
                py = InstallEngine() ?? InstallEngineTheLongWay();
                Pct(1, 100);
                Mark(1, S.Done, "Installed");
            }
            string pyw = Path.Combine(Path.GetDirectoryName(py), "pythonw.exe");
            if (!File.Exists(pyw)) pyw = py;

            // 2. Scanner helper (small; it updates itself from the site after this)
            Mark(2, S.Active, "Downloading");
            Say("Downloading the scanner helper...");
            try { Download(Cfg.AgentUrl, Cfg.AgentPath, delegate (long got, long total) { if (total > 0) Pct(2, (int)(got * 100 / total)); }); }
            catch (SetupException) { if (!File.Exists(Cfg.AgentPath)) throw; Log.Write("using the helper already on this PC"); }
            Pct(2, 100);
            Mark(2, S.Done, "Installed");

            // 3. ZKTeco driver
            Mark(3, S.Active, "Checking");
            if (HasZkDriver())
            {
                Log.Write("ZKTeco driver already present");
                Pct(3, 100);
                Mark(3, S.Done, "Already installed");
            }
            else
            {
                Mark(3, S.Active, "Downloading");
                InstallDriver();
                Pct(3, 100);
                Mark(3, S.Done, "Installed");
            }

            // 4. Start the helper (hidden), register auto-start, and look for the scanner
            Mark(4, S.Active, "Starting");
            Say("Starting the scanner helper...");
            ExecResult inst;
            using (Creep(4, 0, 30, 6000)) inst = RunNative(py, "\"" + Cfg.AgentPath + "\" --install", 60000);
            Log.Write("agent --install exit " + inst.Code + " " + Tail(inst.Out, 2));
            string st = AgentStatus();
            if (st == null)
            {
                var psi = new ProcessStartInfo(pyw, "\"" + Cfg.AgentPath + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                for (int i = 0; i < 40 && st == null; i++) { Pct(4, 30 + i); Thread.Sleep(500); st = AgentStatus(); }
            }
            if (st == null)
                throw new SetupException("The scanner helper didn't start. Details are in the setup folder (agent.log).");

            Pct(4, 70);
            Mark(4, S.Active, "Looking for the scanner");
            Say("Looking for your scanner...");
            for (int i = 0; i < 24 && !IsConnected(st); i++)
            {
                Pct(4, 70 + i);
                Thread.Sleep(500);
                var again = AgentStatus();
                if (again != null) st = again;
            }
            Log.Write("final status: " + st);
            Pct(4, 100);
            if (IsConnected(st)) { Mark(4, S.Done, "Scanner found"); return Outcome.Ready; }
            Mark(4, S.Warn, "Scanner not seen yet");
            return Outcome.ReplugNeeded;
        }
    }

    /// <summary>Raises a percentage on a timer, easing towards a ceiling, until disposed.</summary>
    class Creeper : IDisposable
    {
        volatile bool stop;

        public Creeper(Action<int> report, int from, int to, int expectedMs)
        {
            int start = Environment.TickCount;
            var t = new Thread(delegate ()
            {
                while (!stop)
                {
                    double k = (Environment.TickCount - start) / (double)Math.Max(1, expectedMs);
                    report(from + (int)((to - from) * (1 - Math.Exp(-2.5 * k))));
                    Thread.Sleep(200);
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        public void Dispose() { stop = true; }
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
        readonly int[] stepPct = new int[Cfg.StepNames.Length];
        // How much of the whole setup each step is, so the bar moves in step with the real work.
        static readonly int[] Weight = { 4, 38, 4, 36, 18 };
        double shown; // the bar's drawn percent, easing towards the real one
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

            bar.Location = new Point(50, 430);
            bar.Size = new Size(460, 12);
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

            timer.Interval = 40;
            timer.Tick += delegate
            {
                spin = (spin + 9) % 360;
                double target = Overall();
                shown += (target - shown) * 0.12;
                if (Math.Abs(target - shown) < 0.05) shown = target;
                steps.Invalidate();
                bar.Invalidate();
            };
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
                    DrawIcon(g, state[i], 24, y + rowH / 2 - 1, stepPct[i]);

                    Color nameCol = state[i] == S.Pending ? Mute : Ink;
                    var f = state[i] == S.Active ? activeFont : nameFont;
                    TextRenderer.DrawText(g, Cfg.StepNames[i], f, new Point(50, y + 7), nameCol, TextFormatFlags.NoPadding);

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

        void DrawIcon(Graphics g, S s, int cx, int cy, int pct)
        {
            int r = s == S.Active ? 14 : 10;
            var box = new Rectangle(cx - r, cy - r, r * 2, r * 2);
            switch (s)
            {
                case S.Pending:
                    using (var p = new Pen(Faint, 2)) g.DrawEllipse(p, box);
                    break;
                case S.Active:
                    // Track, the step's real progress (navy, from the top), a small gold arc that keeps turning so it never
                    // looks frozen, and the percentage in the middle.
                    using (var p = new Pen(Color.FromArgb(38, Navy), 3f)) g.DrawEllipse(p, box);
                    if (pct > 0)
                        using (var p = new Pen(Navy, 3f)) { p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; g.DrawArc(p, box, -90, Math.Max(4, pct * 3.6f)); }
                    using (var p = new Pen(Color.FromArgb(200, Gold), 3f)) { p.StartCap = LineCap.Round; p.EndCap = LineCap.Round; g.DrawArc(p, box, spin, 38); }
                    using (var f = new Font("Segoe UI Semibold", pct >= 100 ? 6.5f : 7.25f))
                    using (var sf = new StringFormat())
                    using (var b = new SolidBrush(Navy))
                    {
                        sf.Alignment = StringAlignment.Center;
                        sf.LineAlignment = StringAlignment.Center;
                        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                        g.DrawString(pct + "%", f, b, new RectangleF(cx - r, cy - r + 0.5f, r * 2, r * 2), sf);
                        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
                    }
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
            int w = (int)((bar.Width - 1) * Math.Max(0, Math.Min(100, shown)) / 100.0);
            if (w > 10)
            {
                Color fill = failed ? Red : (finished ? Green : Navy);
                var fillRect = new Rectangle(0, 0, w, bar.Height - 1);
                using (var path = Rounded(fillRect, 5))
                {
                    using (var b = new LinearGradientBrush(new Rectangle(0, -1, w, bar.Height + 1), Lighter(fill, 0.22), fill, LinearGradientMode.Vertical))
                        g.FillPath(b, path);
                    if (!finished && !failed)
                    {
                        // A soft band of light that runs left to right across the filled part, like the classic Windows bar.
                        int band = 110;
                        int travel = w + band;
                        int x = (int)((Environment.TickCount % 1600) / 1600.0 * travel) - band;
                        var bandRect = new Rectangle(x, 0, band, bar.Height);
                        var oldClip = g.Clip;
                        g.SetClip(path);
                        using (var gb = new LinearGradientBrush(bandRect, Color.Transparent, Color.Transparent, LinearGradientMode.Horizontal))
                        {
                            var blend = new ColorBlend(3);
                            blend.Colors = new[] { Color.FromArgb(0, White), Color.FromArgb(150, White), Color.FromArgb(0, White) };
                            blend.Positions = new[] { 0f, 0.5f, 1f };
                            gb.InterpolationColors = blend;
                            g.FillRectangle(gb, bandRect);
                        }
                        g.Clip = oldClip;
                    }
                }
            }
        }

        static Color Lighter(Color c, double k)
        {
            return Color.FromArgb(c.R + (int)((255 - c.R) * k), c.G + (int)((255 - c.G) * k), c.B + (int)((255 - c.B) * k));
        }

        /// <summary>The whole setup's percent: finished steps count in full, the running step by its own percent.</summary>
        double Overall()
        {
            if (finished) return 100;
            double sum = 0;
            for (int i = 0; i < state.Length; i++)
            {
                if (state[i] == S.Done || state[i] == S.Warn) sum += Weight[i];
                else if (state[i] == S.Active || state[i] == S.Failed) sum += Weight[i] * stepPct[i] / 100.0;
            }
            return sum;
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
            inst.OnMessage = delegate (string text)
            {
                UI(delegate { message.Text = text; });
            };
            inst.OnStepPct = delegate (int i, int pct)
            {
                UI(delegate { stepPct[i] = pct; });
            };
            try
            {
                Outcome outcome = inst.Run();
                UI(delegate
                {
                    finished = true;
                    shown = 100;
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
                    shown = Overall();
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
                state[3] = S.Active; note[3] = "7.4 of 12.8 MB"; stepPct[3] = 47;
                spin = 200; message.Text = "Downloading the scanner driver (about 13 MB, one time only)...";
            }
            else if (kind == "done")
            {
                state[3] = S.Done; note[3] = "Installed";
                state[4] = S.Done; note[4] = "Scanner found";
                finished = true; shown = 100; title.Text = "You're all set"; sub.Text = "";
                message.Text = "Your scanner is ready. It runs quietly in the background whenever this computer is on.";
                SetButton("Done - back to WorshipHQ", Navy);
            }
            else
            {
                state[3] = S.Failed; note[3] = "Stopped here";
                failed = true; title.Text = "Setup couldn't finish"; title.ForeColor = Red; sub.Text = "";
                message.ForeColor = Red;
                message.Text = "The scanner driver needs your permission. Run setup again and click Yes when Windows asks.";
                detail.Text = "Details: " + Cfg.LogPath;
                SetButton("Close", Navy);
            }
            if (!finished) shown = Overall();
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
                // Optional: --selftest <report> <engine.zip> unpacks the engine into a temp folder and checks it loads.
                if (args.Length >= 3 && File.Exists(args[2]))
                {
                    string dir = Path.Combine(Path.GetTempPath(), "whq-engine-selftest");
                    try { if (Directory.Exists(dir)) Directory.Delete(dir, true); } catch { }
                    var sw = Stopwatch.StartNew();
                    Installer.Unzip(args[2], dir, null);
                    sb.AppendLine("engine-unzip-ms=" + sw.ElapsedMilliseconds);
                    sb.AppendLine("engine-sha-ok=" + string.Equals(Installer.Sha256Of(args[2]), Cfg.RuntimeSha256, StringComparison.OrdinalIgnoreCase));
                    sw.Restart();
                    sb.AppendLine("engine-works=" + Installer.EngineWorks(Path.Combine(dir, "python.exe")) + " (" + sw.ElapsedMilliseconds + " ms)");
                    try { Directory.Delete(dir, true); } catch { }
                }
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
