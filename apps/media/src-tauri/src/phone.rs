//! The phone remote: a page any phone on the same Wi-Fi can open to move the slides. Off until it is turned on, and
//! nothing can be seen or pressed without the PIN.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const PORT: u16 = 18301;
const PAGE: &str = include_str!("phone.html");
/// Wrong PINs allowed in one minute, from everyone together.
const TRIES: usize = 12;

struct Remote {
    stop: Arc<AtomicBool>,
}
static REMOTE: OnceLock<Mutex<Option<Remote>>> = OnceLock::new();
static STATE: OnceLock<Mutex<String>> = OnceLock::new();
static OPEN: AtomicUsize = AtomicUsize::new(0);

fn remote() -> &'static Mutex<Option<Remote>> {
    REMOTE.get_or_init(|| Mutex::new(None))
}
fn state() -> &'static Mutex<String> {
    STATE.get_or_init(|| Mutex::new("{}".into()))
}

pub fn set_state(json: String) {
    if let Ok(mut s) = state().lock() {
        *s = json;
    }
}

/// This computer's address on the network (nothing is sent to find it).
fn address() -> Option<String> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    let ip = s.local_addr().ok()?.ip();
    if ip.is_loopback() || ip.is_unspecified() { None } else { Some(ip.to_string()) }
}

/// Starts it (or starts it again with another PIN). Returns the address to open on the phone.
pub fn start<F: Fn(String) + Send + Sync + 'static>(pin: String, on_action: F) -> Result<String, String> {
    if pin.len() < 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("The PIN must be 6 digits.".into());
    }
    stop();
    let ip = address().ok_or("This computer isn't on a network. Connect it to the church Wi-Fi first.")?;
    let listener = (0..10)
        .find_map(|_| TcpListener::bind(("0.0.0.0", PORT)).ok().or_else(|| { std::thread::sleep(Duration::from_millis(100)); None }))
        .ok_or("The phone remote couldn't start: another program is using its place (port 18301).")?;
    let stop_flag = Arc::new(AtomicBool::new(false));
    let flag = stop_flag.clone();
    let on_action = Arc::new(on_action);
    let wrong: Arc<Mutex<Vec<Instant>>> = Arc::default();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if flag.load(Ordering::SeqCst) {
                break;
            }
            if OPEN.load(Ordering::SeqCst) > 40 {
                continue;
            }
            OPEN.fetch_add(1, Ordering::SeqCst);
            let (pin, act, wrong) = (pin.clone(), on_action.clone(), wrong.clone());
            std::thread::spawn(move || {
                serve(stream, &pin, &*act, &wrong);
                OPEN.fetch_sub(1, Ordering::SeqCst);
            });
        }
    });
    if let Ok(mut r) = remote().lock() {
        *r = Some(Remote { stop: stop_flag });
    }
    Ok(format!("http://{ip}:{PORT}"))
}

pub fn stop() {
    let Ok(mut r) = remote().lock() else { return };
    if let Some(old) = r.take() {
        old.stop.store(true, Ordering::SeqCst);
        // Wakes it up so it can end.
        let _ = TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_millis(300));
    }
}

fn serve(mut stream: TcpStream, pin: &str, act: &(dyn Fn(String) + Send + Sync), wrong: &Mutex<Vec<Instant>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let mut buf = Vec::new();
    let mut part = [0u8; 2048];
    while buf.len() < 8192 && !buf.windows(4).any(|w| w == b"\r\n\r\n") {
        match stream.read(&mut part) {
            Ok(n) if n > 0 => buf.extend_from_slice(&part[..n]),
            _ => break,
        }
    }
    let req = String::from_utf8_lossy(&buf);
    let mut first = req.lines().next().unwrap_or("").split_whitespace();
    let (method, path) = (first.next().unwrap_or("").to_string(), first.next().unwrap_or("/").to_string());
    if path == "/" {
        return reply(&mut stream, "200 OK", "text/html; charset=utf-8", PAGE);
    }
    let given = req.lines().find_map(|l| l.split_once(':').filter(|(k, _)| k.eq_ignore_ascii_case("x-pin")).map(|(_, v)| v.trim().to_string())).unwrap_or_default();
    {
        let Ok(mut w) = wrong.lock() else { return };
        w.retain(|t| t.elapsed() < Duration::from_secs(60));
        if w.len() >= TRIES {
            return reply(&mut stream, "429 Too Many Requests", "application/json", "{\"error\":\"Too many wrong PINs. Wait a minute.\"}");
        }
        if given != pin {
            if !given.is_empty() {
                w.push(Instant::now());
            }
            return reply(&mut stream, "401 Unauthorized", "application/json", "{\"error\":\"Wrong PIN\"}");
        }
    }
    if path == "/state" {
        let s = state().lock().map(|s| s.clone()).unwrap_or_default();
        return reply(&mut stream, "200 OK", "application/json; charset=utf-8", &s);
    }
    if let (Some(a), "POST") = (path.strip_prefix("/do/"), method.as_str()) {
        let action: String = a.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
        act(action);
        return reply(&mut stream, "200 OK", "application/json", "{\"ok\":true}");
    }
    reply(&mut stream, "404 Not Found", "text/plain", "");
}

fn reply(stream: &mut TcpStream, status: &str, kind: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nCache-Control: no-store\r\nX-Frame-Options: DENY\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}
