import { useEffect, useState } from "react";
import {
  Save, Loader2, Database, RefreshCw, Trash2, User, Church, HardDrive,
  ExternalLink, Users2, Layers, Shield, Plus, X, Check, Pencil,
  Palette, Link2, CreditCard, MessageSquare, Copy, Eye, EyeOff,
  UserPlus, ChevronDown, ChevronUp, AlertTriangle, Building2, Bell, Award, Wallet,
  Clock, CheckCircle2,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { PageHeader } from "../components/ui/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Modal } from "../components/ui/Modal";
import { useAppStore } from "../stores/app-store";
import { db, sync, auth, appInfo, server } from "../lib/api";
import { requireOnline } from "../lib/net";
import { cn } from "../lib/utils";
import { v4 as uuid } from "uuid";
import {
  FormBuilder, resolveFormDefinition,
  DEFAULT_FORM, DEFAULT_VISITOR_FORM, DEFAULT_CHILDREN_FORM, DEFAULT_TEENS_FORM,
} from "../components/FormBuilder";

type Tab =
  | "profile" | "church" | "branding" | "team" | "departments" | "positions"
  | "branches" | "joinlink" | "automations" | "billing" | "online-payments" | "sms" | "sync" | "about";

const ALL_ROLES = ["Admin", "Pastor", "Finance", "Media", "Leader", "Volunteer"];
// Mirrors web src/lib/permissions.ts ALL_MODULES (includes harvest).
const ALL_MODULES = ["people", "attendance", "events", "volunteers", "giving", "accounting", "harvest", "communications", "reminders", "settings"];
const MODULE_LABELS: Record<string, string> = {
  people: "People", attendance: "Attendance", events: "Events", volunteers: "Volunteers",
  giving: "Giving", accounting: "Accounting", harvest: "Harvest", communications: "Communications",
  reminders: "Reminders", settings: "Settings",
};

// Built-in role defaults (mirror ROLE_PERMISSIONS in web).
const ROLE_DEFAULTS: Record<string, string[]> = {
  Admin: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "settings", "accounting", "harvest"],
  Pastor: ["people", "attendance", "giving", "events", "volunteers", "communications", "reminders", "settings"],
  Finance: ["giving", "accounting", "harvest", "people", "reminders"],
  Media: ["communications", "events", "people"],
  Leader: ["people", "attendance", "events", "volunteers", "communications", "reminders"],
  Volunteer: ["people", "attendance", "events"],
};

const VALID_POSITIONS = ["Head", "Assistant Head", "Secretary", "Treasurer", "Coordinator", "Vice President", "President"];

// Automation triggers (mirror web TRIGGER_CATALOG keys).
const TRIGGERS = [
  { key: "birthday", name: "Birthday wishes", desc: "Send a message on members' birthdays." },
  { key: "anniversary", name: "Anniversary wishes", desc: "Celebrate wedding anniversaries." },
  { key: "visitor_followup", name: "Visitor follow-up", desc: "Reach out to first-time visitors." },
  { key: "lapsed", name: "Lapsed member re-engagement", desc: "Check in with members who've gone quiet." },
  { key: "new_member", name: "New member welcome", desc: "Welcome newly registered members." },
  { key: "giving_thanks", name: "Giving thank-you", desc: "Thank members after they give." },
  { key: "custom", name: "Custom reminder", desc: "A one-off or recurring reminder you define." },
];

export function SettingsPage() {
  const { session, syncStatus, setSyncStatus, setSession, showToast } = useAppStore();
  const [tab, setTab] = useState<Tab>("profile");
  const [syncing, setSyncing] = useState(false);
  const [version, setVersion] = useState("0.1.0");
  const [dataPath, setDataPath] = useState("");

  useEffect(() => {
    appInfo.version().then(setVersion);
    appInfo.dataPath().then(setDataPath);
  }, []);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "profile", label: "My Profile", icon: User },
    { key: "church", label: "Church Profile", icon: Church },
    { key: "branding", label: "Branding", icon: Palette },
    { key: "team", label: "Users & Roles", icon: Users2 },
    { key: "departments", label: "Departments", icon: Layers },
    { key: "positions", label: "Positions", icon: Award },
    { key: "branches", label: "Branches", icon: Building2 },
    { key: "joinlink", label: "Join Link & Forms", icon: Link2 },
    { key: "automations", label: "Automations", icon: Bell },
    { key: "billing", label: "Billing", icon: CreditCard },
    { key: "online-payments", label: "Online Payments", icon: Wallet },
    { key: "sms", label: "SMS Settings", icon: MessageSquare },
    { key: "sync", label: "Sync & Data", icon: RefreshCw },
    { key: "about", label: "About", icon: HardDrive },
  ];

  async function handleSync() {
    setSyncing(true);
    const result = await sync.now();
    setSyncStatus(result);
    setSyncing(false);
  }

  async function handleClearData() {
    if (!confirm("This will clear all local data and log you out. You'll need to log in and sync again. Continue?")) return;
    await auth.logout();
    setSession(null);
    showToast("Local data cleared", "info");
  }

  function handleOpenWebsite() {
    window.api?.openExternal("https://worshiphq.app/app/settings");
  }

  return (
    <PageShell title="Settings">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="shrink-0">
          <div className="space-y-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-primary/15 text-primary-bright"
                    : "text-ink-muted hover:bg-surface-3 hover:text-ink"
                }`}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <button
              onClick={handleOpenWebsite}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              <ExternalLink className="size-3.5" />
              Open web settings
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {tab === "profile" && <ProfileTab />}
          {tab === "church" && <ChurchTab />}
          {tab === "branding" && <BrandingTab />}
          {tab === "team" && <TeamTab />}
          {tab === "departments" && <DepartmentsTab />}
          {tab === "positions" && <PositionsTab />}
          {tab === "branches" && <BranchesTab />}
          {tab === "joinlink" && <JoinLinkTab />}
          {tab === "automations" && <AutomationsTab />}
          {tab === "billing" && <BillingTab />}
          {tab === "online-payments" && <OnlinePaymentsTab />}
          {tab === "sms" && <SmsTab />}
          {tab === "sync" && (
            <SyncTab
              syncStatus={syncStatus}
              syncing={syncing}
              onSync={handleSync}
              onClear={handleClearData}
              dataPath={dataPath}
            />
          )}
          {tab === "about" && <AboutTab version={version} />}
        </div>
      </div>
    </PageShell>
  );
}

/* ─── Profile Tab ─── */
function ProfileTab() {
  const { session, showToast, setSession } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session?.userName || "");
  const [saving, setSaving] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(session?.userPhotoUrl || null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const userId = session?.userId;
      if (userId) {
        await db.update("user", userId, { name: name.trim() });
        await window.api?.setMeta("user_name", name.trim());
        if (session) setSession({ ...session, userName: name.trim() });
        showToast("Profile updated! Changes will sync.");
      }
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
    setEditing(false);
  }

  async function handlePickPhoto() {
    setPickingPhoto(true);
    try {
      const result = await window.api?.pickImage();
      if (!result) { setPickingPhoto(false); return; }
      if (typeof result === "object" && "error" in result) {
        showToast(result.error, "error");
        setPickingPhoto(false);
        return;
      }
      const dataUrl = result as string;
      const userId = session?.userId;
      if (userId) {
        await db.update("user", userId, { photo_url: dataUrl });
        await window.api?.setMeta("user_photo_url", dataUrl);
        setPhotoPreview(dataUrl);
        if (session) setSession({ ...session, userPhotoUrl: dataUrl });
        showToast("Photo updated! Changes will sync.");
      }
    } catch {
      showToast("Failed to update photo", "error");
    }
    setPickingPhoto(false);
  }

  async function handleRemovePhoto() {
    const userId = session?.userId;
    if (!userId) return;
    setSaving(true);
    try {
      await db.update("user", userId, { photo_url: null });
      await window.api?.setMeta("user_photo_url", "");
      setPhotoPreview(null);
      if (session) setSession({ ...session, userPhotoUrl: null });
      showToast("Photo removed. Changes will sync.");
    } catch {
      showToast("Failed to remove photo", "error");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">My Profile</h2>
        <p className="text-sm text-ink-muted">Your account details synced from WorshipHQ.</p>
      </div>

      <div className="card space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar name={session?.userName || "User"} src={photoPreview} size="xl" />
            <button
              onClick={handlePickPhoto}
              disabled={pickingPhoto}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Change photo"
            >
              {pickingPhoto ? (
                <Loader2 className="size-4 text-white whq-spin" />
              ) : (
                <Pencil className="size-4 text-white" />
              )}
            </button>
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} className="input max-w-xs" autoFocus />
                <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
                  {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setName(session?.userName || ""); }} className="btn-ghost btn-sm">Cancel</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-ink">{session?.userName}</p>
                  <button onClick={() => setEditing(true)} className="grid size-6 place-items-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-ink">
                    <Pencil className="size-3" />
                  </button>
                </div>
                <p className="text-sm text-ink-muted">{session?.userEmail}</p>
                <span className="mt-1 inline-block badge badge-primary capitalize">{session?.userRole}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handlePickPhoto} disabled={pickingPhoto} className="btn-secondary btn-sm">
            {pickingPhoto ? <Loader2 className="size-3.5 whq-spin" /> : <Pencil className="size-3.5" />}
            {pickingPhoto ? "Choosing..." : "Change Photo"}
          </button>
          {photoPreview && (
            <button onClick={handleRemovePhoto} disabled={saving} className="btn-ghost btn-sm text-danger">
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <p className="text-xs text-ink-faint">Church</p>
            <p className="text-sm font-medium text-ink">{session?.churchName}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Server</p>
            <p className="text-sm font-medium text-ink">{session?.serverUrl}</p>
          </div>
        </div>
      </div>

      <AccountSecuritySection />
    </div>
  );
}

/* ─── Account security: change password / phone / email via server bridge ─── */
function AccountSecuritySection() {
  const { session, setSession, showToast } = useAppStore();
  const [mode, setMode] = useState<"none" | "password" | "phone" | "email">("none");
  const [busy, setBusy] = useState(false);
  const [otpStage, setOtpStage] = useState<{ verificationId: string; kind: "phone" | "email"; newValue: string } | null>(null);
  const [form, setForm] = useState({ current: "", next: "", password: "", newPhone: "", newEmail: "", code: "" });

  const set = (key: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function reset() {
    setMode("none");
    setOtpStage(null);
    setForm({ current: "", next: "", password: "", newPhone: "", newEmail: "", code: "" });
  }

  async function call(payload: Record<string, any>): Promise<any> {
    const ok = await requireOnline("update your account");
    if (!ok) return null;
    setBusy(true);
    const result = await server.fetch("/api/desktop/account", "POST", payload);
    setBusy(false);
    if (result?.error && !("ok" in result)) {
      showToast(result.error, "error");
      return null;
    }
    return result;
  }

  async function handleChangePassword() {
    const r = await call({ action: "change-password", current: form.current, next: form.next });
    if (!r) return;
    if (!r.ok) { showToast(r.error || "Failed", "error"); return; }
    showToast("Password changed");
    reset();
  }

  async function handleStartPhone() {
    const r = await call({ action: "start-phone-change", password: form.password, newPhone: form.newPhone });
    if (!r) return;
    if (!r.ok) { showToast(r.error || "Failed", "error"); return; }
    setOtpStage({ verificationId: r.verificationId, kind: "phone", newValue: form.newPhone });
    showToast("Verification code sent by SMS");
  }

  async function handleStartEmail() {
    const r = await call({ action: "start-email-change", password: form.password, newEmail: form.newEmail });
    if (!r) return;
    if (!r.ok) { showToast(r.error || "Failed", "error"); return; }
    setOtpStage({ verificationId: r.verificationId, kind: "email", newValue: form.newEmail });
    showToast("Verification code sent");
  }

  async function handleConfirmOtp() {
    if (!otpStage) return;
    const payload = otpStage.kind === "phone"
      ? { action: "confirm-phone-change", verificationId: otpStage.verificationId, code: form.code, newPhone: otpStage.newValue }
      : { action: "confirm-email-change", verificationId: otpStage.verificationId, code: form.code, newEmail: otpStage.newValue };
    const r = await call(payload);
    if (!r) return;
    if (!r.ok) { showToast(r.error || "Invalid code", "error"); return; }
    if (otpStage.kind === "email" && session) {
      setSession({ ...session, userEmail: otpStage.newValue });
    }
    showToast(otpStage.kind === "phone" ? "Phone number updated" : "Email updated");
    reset();
  }

  const options = [
    { key: "password" as const, icon: Shield, title: "Change password", desc: "Requires your current password." },
    { key: "phone" as const, icon: MessageSquare, title: "Change phone", desc: "Password + SMS code to the new number." },
    { key: "email" as const, icon: ExternalLink, title: "Change email", desc: "Password + code sent to the new email." },
  ];

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <Shield className="size-4" /> Security
        </h3>
        <p className="text-xs text-ink-muted mt-0.5">Update your password, phone or email. Requires an internet connection.</p>
      </div>

      {mode === "none" && (
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((o) => (
            <button key={o.key} onClick={() => setMode(o.key)}
              className="rounded-xl border border-line p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
              <o.icon className="size-4 text-primary-bright" />
              <p className="mt-2 text-sm font-semibold text-ink">{o.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-faint">{o.desc}</p>
            </button>
          ))}
        </div>
      )}

      {mode === "password" && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Current password</label>
            <input type="password" value={form.current} onChange={set("current")} className="input" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">New password</label>
            <input type="password" value={form.next} onChange={set("next")} className="input"
              placeholder="8+ chars, capital, number, symbol" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={reset} className="btn-ghost btn-sm">Cancel</button>
            <button onClick={handleChangePassword} disabled={busy || !form.current || !form.next} className="btn-primary btn-sm">
              {busy && <Loader2 className="size-3.5 whq-spin" />}
              {busy ? "Saving..." : "Change password"}
            </button>
          </div>
        </div>
      )}

      {(mode === "phone" || mode === "email") && !otpStage && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Your password</label>
            <input type="password" value={form.password} onChange={set("password")} className="input" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              {mode === "phone" ? "New phone number" : "New email"}
            </label>
            {mode === "phone" ? (
              <input type="tel" value={form.newPhone} onChange={set("newPhone")} className="input" placeholder="024 000 0000" />
            ) : (
              <input type="email" value={form.newEmail} onChange={set("newEmail")} className="input" placeholder="you@church.org" />
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={reset} className="btn-ghost btn-sm">Cancel</button>
            <button
              onClick={mode === "phone" ? handleStartPhone : handleStartEmail}
              disabled={busy || !form.password || (mode === "phone" ? !form.newPhone : !form.newEmail)}
              className="btn-primary btn-sm"
            >
              {busy && <Loader2 className="size-3.5 whq-spin" />}
              {busy ? "Sending code..." : "Send verification code"}
            </button>
          </div>
        </div>
      )}

      {otpStage && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-sm text-ink-muted">
            Enter the 6-digit code we sent to <span className="font-semibold text-ink">{otpStage.newValue}</span>.
          </p>
          <input
            value={form.code}
            onChange={set("code")}
            className="input text-center font-mono text-lg tracking-[0.5em]"
            maxLength={6}
            placeholder="••••••"
            autoFocus
          />
          <div className="flex gap-2 pt-1">
            <button onClick={reset} className="btn-ghost btn-sm">Cancel</button>
            <button onClick={handleConfirmOtp} disabled={busy || form.code.length < 4} className="btn-primary btn-sm">
              {busy && <Loader2 className="size-3.5 whq-spin" />}
              {busy ? "Verifying..." : "Verify & update"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Church Profile Tab (EDITABLE) ─── */
function ChurchTab() {
  const { session, showToast } = useAppStore();
  const [church, setChurch] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", denomination: "", city: "", country: "Ghana", address: "", member_prefix: "",
  });

  useEffect(() => {
    if (session?.churchId) {
      db.getById("church", session.churchId).then((c) => {
        if (c) {
          setChurch(c);
          setForm({
            name: c.name || "", denomination: c.denomination || "",
            city: c.city || "", country: c.country || "Ghana",
            address: c.address || "", member_prefix: c.member_prefix || "",
          });
        }
      });
    }
  }, [session?.churchId]);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await db.update("church", session!.churchId, form);
      showToast("Church profile updated! Changes will sync.");
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
  }

  if (!church) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 text-primary-bright whq-spin" />
      </div>
    );
  }

  const set = (key: string) => (e: any) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Church Profile</h2>
        <p className="text-sm text-ink-muted">Basic information about your church.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-4 mb-2">
          {church.logo_url ? (
            <img src={church.logo_url} alt="" className="size-14 rounded-xl object-cover" />
          ) : (
            <div className="grid size-14 place-items-center rounded-xl bg-primary-soft">
              <Church className="size-7 text-primary-bright" />
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-ink">{church.name}</p>
            <p className="text-sm text-ink-muted">{church.denomination || "Church"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Church Name *</label>
            <input value={form.name} onChange={set("name")} className="input" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Denomination</label>
            <input value={form.denomination} onChange={set("denomination")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">City</label>
            <input value={form.city} onChange={set("city")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Country</label>
            <input value={form.country} onChange={set("country")} className="input" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-muted mb-1">Address</label>
            <input value={form.address} onChange={set("address")} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Member ID Prefix</label>
            <input value={form.member_prefix} onChange={set("member_prefix")} className="input" placeholder="e.g. GBC" />
          </div>
        </div>

        <div className="pt-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving && <Loader2 className="size-4 whq-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Branding Tab ─── */
function BrandingTab() {
  const { session, showToast } = useAppStore();
  const [church, setChurch] = useState<any>(null);
  const [accent, setAccent] = useState("#6D5EF8");
  const [saving, setSaving] = useState(false);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (session?.churchId) {
      db.getById("church", session.churchId).then((c) => {
        if (c) {
          setChurch(c);
          setAccent(c.accent_color || "#6D5EF8");
          setLogoPreview(c.logo_url || null);
        }
      });
    }
  }, [session?.churchId]);

  async function handlePickLogo() {
    setPickingLogo(true);
    try {
      const result = await window.api?.pickImage();
      if (!result) { setPickingLogo(false); return; }
      if (typeof result === "object" && "error" in result) {
        showToast(result.error, "error");
        setPickingLogo(false);
        return;
      }
      setLogoPreview(result as string);
    } catch {
      showToast("Failed to pick image", "error");
    }
    setPickingLogo(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data: any = { accent_color: accent };
      if (logoPreview && logoPreview !== church?.logo_url) {
        data.logo_url = logoPreview;
      }
      await db.update("church", session!.churchId, data);
      showToast("Branding updated! Changes will sync.");
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
  }

  async function handleRemoveLogo() {
    setSaving(true);
    try {
      await db.update("church", session!.churchId, { logo_url: null });
      setLogoPreview(null);
      showToast("Logo removed.");
    } catch {
      showToast("Failed to remove logo", "error");
    }
    setSaving(false);
  }

  const presetColors = ["#6D5EF8", "#0d7377", "#e74c3c", "#3498db", "#27ae60", "#f39c12", "#8e44ad", "#1abc9c"];

  if (!church) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Branding</h2>
        <p className="text-sm text-ink-muted">Customize your church logo and accent color.</p>
      </div>

      <div className="card space-y-5">
        <div>
          <p className="text-sm font-semibold text-ink mb-3">Church Logo</p>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="size-20 rounded-xl object-cover border border-line" />
            ) : (
              <div className="grid size-20 place-items-center rounded-xl border-2 border-dashed border-line bg-surface-2">
                <Church className="size-8 text-ink-faint" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={handlePickLogo} disabled={pickingLogo} className="btn-secondary btn-sm">
                {pickingLogo ? <Loader2 className="size-3.5 whq-spin" /> : <Pencil className="size-3.5" />}
                {pickingLogo ? "Choosing..." : logoPreview ? "Change Logo" : "Upload Logo"}
              </button>
              {logoPreview && (
                <button onClick={handleRemoveLogo} className="btn-ghost btn-sm text-danger">
                  <Trash2 className="size-3.5" /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink mb-3">Accent Color</p>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl border border-line" style={{ background: accent }} />
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="size-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            />
            <input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="input w-28 font-mono text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            {presetColors.map((c) => (
              <button
                key={c}
                onClick={() => setAccent(c)}
                className={cn(
                  "size-8 rounded-lg border-2 transition-all",
                  accent === c ? "border-ink scale-110" : "border-transparent hover:scale-105"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="pt-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving && <Loader2 className="size-4 whq-spin" />}
            {saving ? "Saving..." : "Save Branding"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Team Tab (fully editable) ─── */
function TeamTab() {
  const { session, showToast } = useAppStore();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "Leader", password: "" });
  const [roleForm, setRoleForm] = useState({ name: "", sections: [] as string[], canDelete: false });

  const isAdmin = session?.userRole === "Owner" || session?.userRole === "Admin";

  useEffect(() => { load(); }, []);

  async function load() {
    const [u, r] = await Promise.all([db.query("user"), db.query("custom_role")]);
    setUsers(u);
    setRoles(r);
    setLoading(false);
  }

  async function handleInvite() {
    if (!invite.name.trim() || !invite.email.trim()) return;
    const ok = await requireOnline("invite a teammate");
    if (!ok) return;
    setInviting(true);
    try {
      await db.insert("user", {
        id: uuid(), church_id: session!.churchId,
        name: invite.name.trim(), email: invite.email.trim(),
        role: invite.role, password_hash: invite.password || "temp123",
      });
      showToast("Teammate invited! They can log in after next sync.");
      setInvite({ name: "", email: "", role: "Leader", password: "" });
      setShowInvite(false);
      load();
    } catch {
      showToast("Failed to invite", "error");
    }
    setInviting(false);
  }

  async function handleChangeRole(userId: string, newRole: string) {
    try {
      await db.update("user", userId, { role: newRole });
      showToast("Role updated");
      load();
    } catch {
      showToast("Failed to update role", "error");
    }
  }

  async function handleRemoveUser(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    try {
      await db.delete("user", userId);
      showToast("Team member removed");
      load();
    } catch {
      showToast("Failed to remove", "error");
    }
  }

  async function handleCreateRole() {
    if (!roleForm.name.trim() || roleForm.sections.length === 0) return;
    setCreatingRole(true);
    try {
      await db.insert("custom_role", {
        id: uuid(), church_id: session!.churchId,
        name: roleForm.name.trim(),
        sections: JSON.stringify(roleForm.sections),
        can_delete: roleForm.canDelete ? 1 : 0,
      });
      showToast("Custom role created");
      setRoleForm({ name: "", sections: [], canDelete: false });
      setShowRoleForm(false);
      load();
    } catch {
      showToast("Failed to create role", "error");
    }
    setCreatingRole(false);
  }

  async function handleDeleteRole(id: string) {
    if (!confirm("Delete this custom role?")) return;
    try {
      await db.delete("custom_role", id);
      showToast("Role deleted");
      load();
    } catch {
      showToast("Failed to delete", "error");
    }
  }

  function toggleSection(mod: string) {
    setRoleForm((f) => ({
      ...f,
      sections: f.sections.includes(mod) ? f.sections.filter((s) => s !== mod) : [...f.sections, mod],
    }));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Users & Roles</h2>
          <p className="text-sm text-ink-muted">{users.length} team member{users.length !== 1 ? "s" : ""}</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary btn-sm">
            <UserPlus className="size-3.5" /> Invite
          </button>
        )}
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card flex items-center gap-4 !p-4">
            <Avatar name={u.name} src={u.photo_url} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink truncate">{u.name}</p>
                {u.id === session?.userId && <span className="badge badge-primary">You</span>}
              </div>
              <p className="text-xs text-ink-muted truncate">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && u.id !== session?.userId && u.role !== "Owner" ? (
                <>
                  <select
                    value={u.role}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    className="input h-8 w-auto text-xs"
                  >
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    {roles.map((cr: any) => <option key={cr.id} value={`custom:${cr.id}`}>{cr.name}</option>)}
                  </select>
                  <button onClick={() => handleRemoveUser(u.id, u.name)}
                    className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Shield className="size-3.5 text-ink-faint" />
                  <span className="text-xs font-medium text-ink-muted capitalize">{u.role}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite a Teammate">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Full Name *</label>
            <input value={invite.name} onChange={(e) => setInvite((f) => ({ ...f, name: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Email *</label>
            <input type="email" value={invite.email} onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Role</label>
              <select value={invite.role} onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value }))} className="input">
                {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Temp Password</label>
              <input value={invite.password} onChange={(e) => setInvite((f) => ({ ...f, password: e.target.value }))} className="input" placeholder="Optional" />
            </div>
          </div>
          <p className="text-xs text-ink-faint">They'll sign in with this email and temporary password.</p>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowInvite(false)} className="btn-ghost flex-1">Cancel</button>
            <button onClick={handleInvite} disabled={inviting} className="btn-primary flex-1">
              {inviting && <Loader2 className="size-4 whq-spin" />}
              {inviting ? "Sending..." : "Send Invite"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Custom roles */}
      {isAdmin && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Shield className="size-4" /> Custom Roles
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">Create roles that can only see certain sections.</p>
            </div>
            <button onClick={() => setShowRoleForm(!showRoleForm)} className="btn-secondary btn-sm">
              <Plus className="size-3.5" /> New Role
            </button>
          </div>

          {roles.length > 0 && (
            <div className="space-y-2">
              {roles.map((cr: any) => {
                let sections: string[] = [];
                try { sections = JSON.parse(cr.sections || "[]"); } catch {}
                return (
                  <div key={cr.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{cr.name}</p>
                      <p className="text-xs text-ink-faint">
                        {sections.length ? sections.map((s) => MODULE_LABELS[s] ?? s).join(", ") : "No sections"}
                        {" · "}{cr.can_delete ? "can delete" : "add only"}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteRole(cr.id)}
                      className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {showRoleForm && (
            <div className="rounded-xl border border-line p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Role Name *</label>
                <input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g. Attendance team" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-2">Sections this role can see</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALL_MODULES.map((m) => (
                    <label key={m} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 cursor-pointer">
                      <input type="checkbox" checked={roleForm.sections.includes(m)}
                        onChange={() => toggleSection(m)} className="rounded border-line accent-primary" />
                      {MODULE_LABELS[m] ?? m}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                <input type="checkbox" checked={roleForm.canDelete}
                  onChange={(e) => setRoleForm((f) => ({ ...f, canDelete: e.target.checked }))}
                  className="rounded border-line accent-primary" />
                Allow this role to delete records
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowRoleForm(false)} className="btn-ghost btn-sm">Cancel</button>
                <button onClick={handleCreateRole} disabled={creatingRole} className="btn-primary btn-sm">
                  {creatingRole && <Loader2 className="size-3.5 whq-spin" />}
                  {creatingRole ? "Creating..." : "Create Role"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && <BuiltInRolesEditor />}
    </div>
  );
}

/* ─── Built-in role permissions editor ─── */
function BuiltInRolesEditor() {
  const { session, showToast } = useAppStore();
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.churchId) {
      db.getById("church", session.churchId).then((c) => {
        let stored: Record<string, string[]> = {};
        try { stored = c?.role_permissions ? JSON.parse(c.role_permissions) : {}; } catch {}
        setPerms(stored);
      });
    }
  }, [session?.churchId]);

  function startEdit(role: string) {
    setEditing(role);
    setDraft(perms[role] ?? ROLE_DEFAULTS[role] ?? []);
  }

  function toggle(mod: string) {
    setDraft((d) => (d.includes(mod) ? d.filter((m) => m !== mod) : [...d, mod]));
  }

  async function save(role: string) {
    setSaving(true);
    try {
      const next = { ...perms, [role]: draft };
      await db.update("church", session!.churchId, { role_permissions: JSON.stringify(next) });
      setPerms(next);
      setEditing(null);
      showToast("Permissions updated! Changes will sync.");
    } catch {
      showToast("Failed to save permissions", "error");
    }
    setSaving(false);
  }

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <Shield className="size-4" /> Built-in Role Permissions
        </h3>
        <p className="text-xs text-ink-muted mt-0.5">Customize what each built-in role can access. Owner always has full access.</p>
      </div>

      <div className="divide-y divide-line-soft">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-ink">Owner</p>
            <p className="text-xs text-ink-faint">Full access to everything</p>
          </div>
        </div>
        {ALL_ROLES.map((role) => {
          const current = perms[role] ?? ROLE_DEFAULTS[role] ?? [];
          const isEditing = editing === role;
          return (
            <div key={role} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{role}</p>
                  <p className="text-xs text-ink-faint">
                    {current.map((s) => MODULE_LABELS[s] ?? s).join(", ") || "No access"}
                  </p>
                </div>
                <button onClick={() => (isEditing ? setEditing(null) : startEdit(role))}
                  className={cn("grid size-7 place-items-center rounded-lg border border-line transition-colors",
                    isEditing ? "bg-primary-soft text-primary-bright" : "text-ink-muted hover:bg-surface-2")}>
                  <Pencil className="size-3.5" />
                </button>
              </div>
              {isEditing && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {ALL_MODULES.map((m) => (
                      <label key={m} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 cursor-pointer">
                        <input type="checkbox" checked={draft.includes(m)} onChange={() => toggle(m)}
                          className="rounded border-line accent-primary" />
                        {MODULE_LABELS[m] ?? m}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => save(role)} disabled={saving} className="btn-primary btn-sm">
                      {saving && <Loader2 className="size-3.5 whq-spin" />}
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Positions Tab ─── */
function PositionsTab() {
  const { session, showToast } = useAppStore();
  const [positions, setPositions] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ personId: "", departmentId: "", position: "Head" });

  useEffect(() => { load(); }, []);

  async function load() {
    const [pos, ppl, depts] = await Promise.all([
      db.rawQuery(
        `SELECT dp.*, p.first_name, p.last_name, d.name as dept_name
         FROM department_position dp
         LEFT JOIN person p ON dp.person_id = p.id
         LEFT JOIN department d ON dp.department_id = d.id
         ORDER BY d.name, dp.position`
      ),
      db.query("person"),
      db.query("department"),
    ]);
    setPositions(pos);
    setPeople(ppl);
    setDepartments(depts);
    setLoading(false);
  }

  async function handleAdd() {
    if (!form.personId || !form.departmentId || !form.position) return;
    setSaving(true);
    try {
      await db.insert("department_position", {
        id: uuid(), church_id: session!.churchId,
        person_id: form.personId, department_id: form.departmentId, position: form.position,
      });
      showToast("Position assigned! Changes will sync.");
      setForm({ personId: "", departmentId: "", position: "Head" });
      setAdding(false);
      load();
    } catch {
      showToast("Failed to assign position (may already exist)", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this position?")) return;
    try {
      await db.delete("department_position", id);
      showToast("Position removed");
      load();
    } catch {
      showToast("Failed to remove", "error");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Positions</h2>
          <p className="text-sm text-ink-muted">Assign named positions (Head, Secretary…) within departments.</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm" disabled={departments.length === 0}>
          <Plus className="size-3.5" /> Assign Position
        </button>
      </div>

      {adding && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Member</label>
              <select value={form.personId} onChange={(e) => setForm((f) => ({ ...f, personId: e.target.value }))} className="input">
                <option value="">Select member…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Department</label>
              <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))} className="input">
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Position</label>
              <select value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} className="input">
                {VALID_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary btn-sm">
              {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
              {saving ? "Saving..." : "Assign"}
            </button>
            <button onClick={() => setAdding(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {positions.map((p) => (
          <div key={p.id} className="card flex items-center justify-between !p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary-soft">
                <Award className="size-4 text-primary-bright" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{p.first_name} {p.last_name}</p>
                <p className="text-xs text-ink-faint">{p.position} · {p.dept_name || "Unknown dept"}</p>
              </div>
            </div>
            <button onClick={() => handleDelete(p.id)}
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {positions.length === 0 && (
          <div className="card text-center py-10">
            <Award className="size-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No positions assigned yet</p>
            {departments.length === 0 && <p className="text-xs text-ink-faint mt-1">Create a department first.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Branches Tab ─── */
function BranchesTab() {
  const { session, showToast } = useAppStore();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", city: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const rows = await db.query("branch");
    setBranches(rows);
    setLoading(false);
  }

  async function handleAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await db.insert("branch", {
        id: uuid(), church_id: session!.churchId,
        name: form.name.trim(), city: form.city.trim() || null,
        is_hq: branches.length === 0 ? 1 : 0,
      });
      showToast("Branch added! Changes will sync.");
      setForm({ name: "", city: "" });
      setAdding(false);
      load();
    } catch {
      showToast("Failed to add branch", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await db.delete("branch", id);
      showToast("Branch deleted");
      load();
    } catch {
      showToast("Failed to delete", "error");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Branches</h2>
          <p className="text-sm text-ink-muted">{branches.length} branch{branches.length !== 1 ? "es" : ""}. The first branch is your HQ.</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Branch
        </button>
      </div>

      {adding && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Branch Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g. East Campus" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">City</label>
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary btn-sm">
              {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
              {saving ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setAdding(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {branches.map((b) => (
          <div key={b.id} className="card flex items-center justify-between !p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary-soft">
                <Building2 className="size-4 text-primary-bright" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{b.name}</p>
                  {b.is_hq ? <span className="badge badge-primary">HQ</span> : null}
                </div>
                <p className="text-xs text-ink-faint">{b.city || "No city"}</p>
              </div>
            </div>
            <button onClick={() => handleDelete(b.id, b.name)}
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {branches.length === 0 && (
          <div className="card text-center py-10">
            <Building2 className="size-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No branches yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Automations Tab ─── */
function AutomationsTab() {
  const { session, showToast } = useAppStore();
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ trigger: "birthday", name: "", channel: "SMS", customDate: "", customRecurrence: "once", audience: "all", messageTemplate: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const rows = await db.query("automation");
    setAutomations(rows);
    setLoading(false);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const def = TRIGGERS.find((t) => t.key === form.trigger);
      const isCustom = form.trigger === "custom";
      await db.insert("automation", {
        id: uuid(), church_id: session!.churchId,
        name: (isCustom ? form.name.trim() || "Custom reminder" : form.name.trim() || def?.name || "Reminder"),
        description: def?.desc || null,
        trigger_type: form.trigger,
        channel: form.channel,
        active: 1,
        runs: 0,
        message_template: form.messageTemplate.trim() || null,
        custom_date: isCustom && form.customDate ? new Date(form.customDate).toISOString() : null,
        custom_recurrence: isCustom ? form.customRecurrence : null,
        audience: isCustom ? form.audience : null,
      });
      showToast("Automation created! Changes will sync.");
      setForm({ trigger: "birthday", name: "", channel: "SMS", customDate: "", customRecurrence: "once", audience: "all", messageTemplate: "" });
      setShowForm(false);
      load();
    } catch {
      showToast("Failed to create automation", "error");
    }
    setSaving(false);
  }

  async function toggleActive(a: any) {
    try {
      await db.update("automation", a.id, { active: a.active ? 0 : 1 });
      load();
    } catch {
      showToast("Failed to update", "error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this automation?")) return;
    try {
      await db.delete("automation", id);
      showToast("Automation deleted");
      load();
    } catch {
      showToast("Failed to delete", "error");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  const isCustom = form.trigger === "custom";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Automations & Reminders</h2>
          <p className="text-sm text-ink-muted">Automatic messages triggered by events like birthdays and new members.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> New Automation
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Trigger</label>
              <select value={form.trigger} onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))} className="input">
                {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Channel</label>
              <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} className="input">
                <option value="SMS">SMS</option>
                <option value="Email">Email</option>
                <option value="Push">Push</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Name {isCustom ? "*" : "(optional)"}</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input"
              placeholder={TRIGGERS.find((t) => t.key === form.trigger)?.name} />
          </div>
          {isCustom && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Date</label>
                <input type="date" value={form.customDate} onChange={(e) => setForm((f) => ({ ...f, customDate: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Recurrence</label>
                <select value={form.customRecurrence} onChange={(e) => setForm((f) => ({ ...f, customRecurrence: e.target.value }))} className="input">
                  <option value="once">Once</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Audience</label>
                <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))} className="input">
                  <option value="all">All members</option>
                  <option value="active">Active only</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Message Template</label>
            <textarea value={form.messageTemplate} onChange={(e) => setForm((f) => ({ ...f, messageTemplate: e.target.value }))}
              className="input min-h-[70px]" placeholder="Use {name}, {church} placeholders…" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving} className="btn-primary btn-sm">
              {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
              {saving ? "Saving..." : "Create"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {automations.map((a) => (
          <div key={a.id} className="card flex items-center justify-between !p-4">
            <div className="flex items-center gap-3">
              <div className={cn("grid size-9 place-items-center rounded-lg", a.active ? "bg-success/10" : "bg-surface-3")}>
                <Bell className={cn("size-4", a.active ? "text-success" : "text-ink-faint")} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{a.name}</p>
                <p className="text-xs text-ink-faint">{a.trigger_type} · {a.channel} · {a.runs || 0} run{(a.runs || 0) !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(a)} className={cn("badge", a.active ? "badge-success" : "badge-muted")}>
                {a.active ? "Active" : "Paused"}
              </button>
              <button onClick={() => handleDelete(a.id)}
                className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        {automations.length === 0 && (
          <div className="card text-center py-10">
            <Bell className="size-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No automations yet</p>
            <p className="text-xs text-ink-faint mt-1">Create reminders for birthdays, new members, and more.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Departments Tab ─── */
function DepartmentsTab() {
  const { showToast } = useAppStore();
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => { loadDepartments(); }, []);

  async function loadDepartments() {
    const depts = await db.query("department");
    setDepartments(depts);
    setLoading(false);

    const counts: Record<string, number> = {};
    for (const d of depts) {
      const members = await db.rawQuery(
        `SELECT COUNT(*) as cnt FROM person_department WHERE department_id = ?`, [d.id]
      );
      counts[d.id] = (members as any)?.[0]?.cnt || 0;
    }
    setMemberCounts(counts);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const session = useAppStore.getState().session;
      await db.insert("department", { id: uuid(), church_id: session?.churchId, name: newName.trim() });
      showToast("Department added!");
      setNewName("");
      setAdding(false);
      loadDepartments();
    } catch {
      showToast("Failed to add department", "error");
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Members won't be removed.`)) return;
    try {
      await db.delete("department", id);
      showToast("Department deleted");
      loadDepartments();
    } catch {
      showToast("Failed to delete", "error");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Departments</h2>
          <p className="text-sm text-ink-muted">{departments.length} department{departments.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
          <Plus className="size-3.5" /> Add Department
        </button>
      </div>

      {adding && (
        <div className="card flex items-center gap-3 !p-3">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input flex-1"
            placeholder="Department name..." autoFocus onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <button onClick={handleAdd} disabled={saving} className="btn-primary btn-sm">
            {saving ? <Loader2 className="size-3.5 whq-spin" /> : <Check className="size-3.5" />}
            {saving ? "Adding..." : "Add"}
          </button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="btn-ghost btn-sm"><X className="size-3.5" /></button>
        </div>
      )}

      <div className="space-y-2">
        {departments.map((d) => (
          <div key={d.id} className="card flex items-center justify-between !p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary-soft">
                <Layers className="size-4 text-primary-bright" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{d.name}</p>
                <p className="text-xs text-ink-faint">{memberCounts[d.id] ?? 0} member{(memberCounts[d.id] ?? 0) !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <button onClick={() => handleDelete(d.id, d.name)}
              className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger transition-all">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="card text-center py-10">
            <Layers className="size-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No departments yet</p>
            <p className="text-xs text-ink-faint mt-1">Add departments to organize your team, or sync to pull from web.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Join Link Tab (with form builders) ─── */
function SharedLinkCard({ title, description, path, slug }: { title: string; description: string; path: string; slug: string }) {
  const { showToast } = useAppStore();
  const url = slug ? `https://worshiphq.app${path}` : "";
  if (!url) return null;
  return (
    <div className="card space-y-2 !p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="text-xs text-ink-muted">{description}</p>
      <div className="flex items-center gap-2">
        <p className="text-xs font-mono text-primary-bright flex-1 break-all">{url}</p>
        <button onClick={async () => { try { await navigator.clipboard.writeText(url); showToast("Link copied!"); } catch { showToast("Failed to copy", "error"); } }}
          className="btn-secondary btn-sm shrink-0"><Copy className="size-3.5" /> Copy</button>
        <button onClick={() => window.api?.openExternal(url)} className="btn-ghost btn-sm shrink-0"><ExternalLink className="size-3.5" /> Open</button>
      </div>
    </div>
  );
}

function JoinLinkTab() {
  const { session, showToast } = useAppStore();
  const [church, setChurch] = useState<any>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = session?.userRole === "Owner" || session?.userRole === "Admin";

  useEffect(() => {
    if (session?.churchId) {
      db.getById("church", session.churchId).then((c) => {
        if (c) { setChurch(c); setSlug(c.slug || ""); }
      });
      db.query("department").then((d) => setDepartments(d.map((x: any) => ({ id: x.id, name: x.name }))));
    }
  }, [session?.churchId]);

  async function handleSaveSlug() {
    if (!slug.trim()) return;
    setSaving(true);
    try {
      await db.update("church", session!.churchId, { slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") });
      showToast("Join link updated! Changes will sync.");
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
  }

  if (!church) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Join Link & Forms</h2>
        <p className="text-sm text-ink-muted">Share registration links and customize the fields members fill in.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Church Slug</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-faint">worshiphq.app/join/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className="input flex-1" placeholder="your-church" />
            <button onClick={handleSaveSlug} disabled={saving} className="btn-primary btn-sm shrink-0">
              {saving && <Loader2 className="size-3.5 whq-spin" />}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-faint">Changing the slug updates every shared link at once.</p>
        </div>
      </div>

      <SharedLinkCard title="Member self-registration"
        description="Members fill in their own details and appear in your People list automatically."
        path={`/join/${slug}`} slug={slug} />
      {isAdmin && (
        <FormBuilder churchId={session!.churchId} column="registration_fields"
          initial={resolveFormDefinition(church.registration_fields, DEFAULT_FORM)}
          departments={departments} />
      )}

      <SharedLinkCard title="Visitor form"
        description="A simpler form for first-time visitors — name, phone, purpose and prayer requests."
        path={`/visit/${slug}`} slug={slug} />
      {isAdmin && (
        <FormBuilder churchId={session!.churchId} column="visitor_form_fields"
          title="Visitor form builder"
          description="Customise the fields first-time visitors fill in. Name fields are always required."
          initial={resolveFormDefinition(church.visitor_form_fields, DEFAULT_VISITOR_FORM)}
          departments={departments} />
      )}

      <SharedLinkCard title="Children's registration"
        description="A simplified form for registering children with guardian, school and class info."
        path={`/children/${slug}`} slug={slug} />
      {isAdmin && (
        <FormBuilder churchId={session!.churchId} column="children_form_fields"
          title="Children's form builder"
          description="Customise the fields for children's registration. Guardian details are included by default."
          initial={resolveFormDefinition(church.children_form_fields, DEFAULT_CHILDREN_FORM)}
          departments={departments} />
      )}

      <SharedLinkCard title="Teens registration"
        description="Registration for teens, including guardian info and department selection."
        path={`/teens/${slug}`} slug={slug} />
      {isAdmin && (
        <FormBuilder churchId={session!.churchId} column="teens_form_fields"
          title="Teens form builder"
          description="Customise the fields for teen registration. Includes department selection."
          initial={resolveFormDefinition(church.teens_form_fields, DEFAULT_TEENS_FORM)}
          departments={departments} />
      )}

      <SharedLinkCard title="Prayer requests"
        description="Share this link so members can submit prayer requests online."
        path={`/pray/${slug}`} slug={slug} />
    </div>
  );
}

/* ─── Billing Tab ─── */
function BillingTab() {
  const { showToast } = useAppStore();
  const [planInfo, setPlanInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    window.api?.getPlan?.().then((info: any) => { setPlanInfo(info); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    const result = await window.api?.refreshPlan?.();
    if (result && !result.error) {
      setPlanInfo(result);
      showToast("Plan info updated");
    } else {
      showToast(result?.error || "Could not reach server", "error");
    }
    setRefreshing(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  const planName = planInfo?.plan ? planInfo.plan.charAt(0).toUpperCase() + planInfo.plan.slice(1) : "Free";
  const isActive = planInfo?.status === "active" || planInfo?.status === "grace";
  const renewsAt = planInfo?.renewsAt;
  const daysLeft = renewsAt ? Math.ceil((new Date(renewsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Billing & Plan</h2>
          <p className="text-sm text-ink-muted">View your subscription status.</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost btn-sm">
          {refreshing ? <Loader2 className="size-3.5 whq-spin" /> : <RefreshCw className="size-3.5" />}
          {refreshing ? "Checking..." : "Refresh"}
        </button>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <div className={cn("grid size-12 place-items-center rounded-xl", isActive ? "bg-success/10" : "bg-danger/10")}>
            <CreditCard className={cn("size-6", isActive ? "text-success" : "text-danger")} />
          </div>
          <div>
            <p className="text-lg font-bold text-ink">{planName} Plan</p>
            <div className="flex items-center gap-2">
              <span className={cn("badge", isActive ? "badge-success" : "badge-muted")}>{planInfo?.status || "free"}</span>
            </div>
          </div>
        </div>

        {renewsAt && (
          <div className="rounded-xl border border-line bg-surface-2/50 p-3">
            <p className="text-xs text-ink-faint">Next renewal</p>
            <p className="text-sm font-medium text-ink">
              {new Date(renewsAt).toLocaleDateString()}
              {daysLeft !== null && daysLeft > 0 && <span className="ml-2 text-xs text-ink-faint">({daysLeft} day{daysLeft !== 1 ? "s" : ""} left)</span>}
              {daysLeft !== null && daysLeft <= 0 && <span className="ml-2 text-xs text-danger font-bold">Expired</span>}
            </p>
          </div>
        )}

        {planInfo?.checkedAt && (
          <p className="text-[11px] text-ink-faint">Last verified: {new Date(planInfo.checkedAt).toLocaleString()}</p>
        )}

        <div className="border-t border-line pt-4">
          <p className="text-sm text-ink-muted">
            To change your plan, add payment methods, or view invoices:
          </p>
          <button onClick={async () => {
            const ok = await requireOnline("manage billing");
            if (ok) window.api?.openExternal("https://worshiphq.app/app/settings");
          }} className="btn-primary btn-sm mt-2">
            <ExternalLink className="size-3.5" /> Manage Billing Online
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── SMS Settings Tab ─── */
function SmsTab() {
  const { session, showToast } = useAppStore();
  const [church, setChurch] = useState<any>(null);
  const [senderId, setSenderId] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.churchId) {
      db.getById("church", session.churchId).then((c) => {
        if (c) { setChurch(c); setSenderId(c.sms_sender_id || ""); }
      });
      db.rawQuery("SELECT * FROM sms_credit WHERE church_id = ?", [session.churchId])
        .then((rows: any[]) => { if (rows.length) setCredits(rows[0]?.balance ?? 0); })
        .catch(() => {});
    }
  }, [session?.churchId]);

  async function handleRequestSenderId() {
    if (!senderId.trim()) return;
    const ok = await requireOnline("request a Sender ID");
    if (!ok) return;
    setSaving(true);
    try {
      await db.update("church", session!.churchId, {
        sms_sender_id: senderId.trim(),
        sms_sender_id_status: "pending",
        sms_sender_id_requested_at: new Date().toISOString(),
      });
      showToast("Sender ID request saved! It will sync to the server.");
    } catch {
      showToast("Failed to save", "error");
    }
    setSaving(false);
  }

  if (!church) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  const senderStatus = church.sms_sender_id_status;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">SMS Settings</h2>
        <p className="text-sm text-ink-muted">Configure SMS broadcasting and sender identity.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink mb-1">SMS Credits</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-ink">{credits ?? "—"}</span>
            <span className="text-sm text-ink-muted">credits remaining</span>
          </div>
          <button onClick={async () => {
            const ok = await requireOnline("buy SMS credits");
            if (ok) window.api?.openExternal("https://worshiphq.app/app/settings");
          }} className="btn-secondary btn-sm mt-2">
            <ExternalLink className="size-3.5" /> Buy Credits Online
          </button>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink mb-1">Sender ID</p>
          <p className="text-xs text-ink-muted mb-3">
            The name that appears as the sender when your church sends SMS messages. Max 11 characters.
          </p>

          {church.sms_sender_id && senderStatus === "approved" ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-3">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-success" />
                <span className="text-sm font-medium text-ink">{church.sms_sender_id}</span>
                <span className="badge badge-success">Approved</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input value={senderId} onChange={(e) => setSenderId(e.target.value.slice(0, 11))}
                  className="input flex-1" placeholder="e.g. GraceBC" maxLength={11} />
                <button onClick={handleRequestSenderId} disabled={saving || !senderId.trim()} className="btn-primary btn-sm">
                  {saving && <Loader2 className="size-3.5 whq-spin" />}
                  {saving ? "Requesting..." : "Request"}
                </button>
              </div>
              {senderStatus === "pending" && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-center gap-2">
                  <Loader2 className="size-4 text-warning whq-spin" />
                  <span className="text-sm text-ink-muted">Sender ID "{church.sms_sender_id}" is pending approval...</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-xs text-ink-faint">
            SMS messages require an internet connection to send. If you're offline when you try to send,
            the app will prompt you to connect. Messages will be queued and sent when you're back online.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Sync Tab ─── */
function SyncTab({
  syncStatus, syncing, onSync, onClear, dataPath,
}: {
  syncStatus: any; syncing: boolean; onSync: () => void; onClear: () => void; dataPath: string;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadCounts() {
      const tables = ["person", "gift", "attendance_session", "event", "department", "user"];
      const c: Record<string, number> = {};
      for (const t of tables) {
        try {
          const rows = await db.rawQuery(`SELECT COUNT(*) as cnt FROM "${t}"`);
          c[t] = (rows as any)?.[0]?.cnt || 0;
        } catch { c[t] = 0; }
      }
      setCounts(c);
    }
    loadCounts();
  }, [syncStatus.lastSyncAt]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Sync & Data</h2>
        <p className="text-sm text-ink-muted">Manage synchronization and local data storage.</p>
      </div>

      <div className="card space-y-4">
        <h3 className="text-sm font-bold text-ink">Sync Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-faint">Last Synced</p>
            <p className="text-sm font-medium text-ink">
              {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : "Never"}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-faint">Pending Changes</p>
            <p className="text-sm font-medium text-ink">{syncStatus.pendingChanges}</p>
          </div>
        </div>
        <button onClick={onSync} disabled={syncing} className="btn-primary py-2 px-4 text-sm">
          {syncing ? <Loader2 className="size-4 whq-spin" /> : <RefreshCw className="size-4" />}
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {Object.keys(counts).length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-sm font-bold text-ink">Local Data</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "person", label: "Members" }, { key: "gift", label: "Gifts" },
              { key: "attendance_session", label: "Services" }, { key: "event", label: "Events" },
              { key: "department", label: "Departments" }, { key: "user", label: "Team" },
            ].map((t) => (
              <div key={t.key} className="rounded-lg border border-line p-3 text-center">
                <p className="text-lg font-bold text-ink">{counts[t.key] ?? 0}</p>
                <p className="text-[10px] text-ink-faint">{t.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <h3 className="text-sm font-bold text-ink">Local Storage</h3>
        <div>
          <p className="text-xs text-ink-faint">Data Location</p>
          <p className="text-sm font-mono text-ink-muted break-all">{dataPath}</p>
        </div>
      </div>

      <div className="card border-danger/20">
        <h3 className="text-sm font-bold text-danger">Danger Zone</h3>
        <p className="mt-1 text-xs text-ink-muted">Clear all local data and reset the app.</p>
        <button onClick={onClear} className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">
          <Trash2 className="size-3.5" /> Clear Data & Log Out
        </button>
      </div>
    </div>
  );
}

/* ─── Online Payments Tab ─── */
function OnlinePaymentsTab() {
  const { session, showToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<any>(null);
  const [form, setForm] = useState({ contactName: "", contactPhone: "", contactEmail: "", needs: "" });

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    setLoading(true);
    const ok = await requireOnline("check payment request status");
    if (!ok) { setLoading(false); return; }
    const result = await server.fetch("/api/desktop/payment-request", "GET");
    if (!result.error) setRequest(result.request);
    setLoading(false);
  }

  async function handleSubmit() {
    if (!form.contactName.trim()) { showToast("Contact name is required", "error"); return; }
    const ok = await requireOnline("submit a payment request");
    if (!ok) return;
    setSubmitting(true);
    const result = await server.fetch("/api/desktop/payment-request", "POST", form);
    if (result.error) {
      showToast(result.error, "error");
    } else {
      showToast("Payment request submitted! We'll be in touch.");
      setForm({ contactName: "", contactPhone: "", contactEmail: "", needs: "" });
      loadStatus();
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-primary-bright whq-spin" /></div>;
  }

  const status = request?.status;
  const isActive = status === "pending" || status === "scheduled" || status === "in_progress";
  const isCompleted = status === "completed";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Online Payments</h2>
        <p className="text-sm text-ink-muted">
          Request online payment setup so your members can give digitally via mobile money, card, or USSD.
        </p>
      </div>

      {isCompleted && (
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-success/10">
              <CheckCircle2 className="size-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Online Payments Active</p>
              <p className="text-xs text-ink-muted">Your online payment setup is complete.</p>
            </div>
          </div>

          {request.ussdCode && (
            <div className="rounded-xl border border-line bg-surface-2/50 p-3">
              <p className="text-xs text-ink-faint">USSD Code</p>
              <p className="text-lg font-bold font-mono text-ink">{request.ussdCode}</p>
              <p className="text-xs text-ink-faint mt-1">Members can dial this code on any phone to give.</p>
            </div>
          )}

          {request.portalUrl && (
            <div className="rounded-xl border border-line bg-surface-2/50 p-3">
              <p className="text-xs text-ink-faint">Payment Portal</p>
              <button
                onClick={() => window.api?.openExternal(request.portalUrl)}
                className="text-sm font-medium text-primary-bright hover:underline break-all text-left"
              >
                {request.portalUrl}
              </button>
              <p className="text-xs text-ink-faint mt-1">Share this link with your members.</p>
            </div>
          )}
        </div>
      )}

      {isActive && (
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "grid size-10 place-items-center rounded-xl",
              status === "pending" ? "bg-warning/10" : "bg-primary-soft"
            )}>
              {status === "pending" ? (
                <Clock className="size-5 text-warning" />
              ) : (
                <Loader2 className="size-5 text-primary-bright whq-spin" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-ink">
                {status === "pending" && "Request Pending"}
                {status === "scheduled" && "Meeting Scheduled"}
                {status === "in_progress" && "Setup In Progress"}
              </p>
              <p className="text-xs text-ink-muted">
                {status === "pending" && "Your request has been submitted. We'll reach out to schedule a meeting."}
                {status === "scheduled" && "A meeting has been scheduled to set up your payment account."}
                {status === "in_progress" && "We're setting up your payment account. This should be done shortly."}
              </p>
            </div>
          </div>

          {request.meetingDate && (
            <div className="rounded-xl border border-line bg-surface-2/50 p-3">
              <p className="text-xs text-ink-faint">Meeting</p>
              <p className="text-sm font-medium text-ink">
                {new Date(request.meetingDate).toLocaleString()}
                {request.meetingType && (
                  <span className="ml-2 text-xs text-ink-faint capitalize">({request.meetingType.replace("_", " ")})</span>
                )}
              </p>
            </div>
          )}

          <p className="text-xs text-ink-faint">
            Submitted: {new Date(request.createdAt).toLocaleDateString()}
          </p>

          <button onClick={loadStatus} className="btn-ghost btn-sm">
            <RefreshCw className="size-3.5" /> Check Status
          </button>
        </div>
      )}

      {!isActive && !isCompleted && (
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="grid size-10 place-items-center rounded-xl bg-primary-soft">
              <Wallet className="size-5 text-primary-bright" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Request Online Payment Setup</p>
              <p className="text-xs text-ink-muted">We'll set up a payment account for your church.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Contact Name *</label>
              <input
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                className="input"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Phone Number</label>
              <input
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                className="input"
                placeholder="e.g. 024 XXX XXXX"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="input"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">What payment options do you need?</label>
            <textarea
              value={form.needs}
              onChange={(e) => setForm((f) => ({ ...f, needs: e.target.value }))}
              className="input min-h-[80px]"
              placeholder="e.g. Mobile Money, Visa/Mastercard, USSD, online payment portal..."
            />
          </div>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
            {submitting && <Loader2 className="size-4 whq-spin" />}
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      )}

      <div className="card !bg-surface-2/30">
        <p className="text-xs text-ink-faint">
          Online payments are processed through Paystack. After submitting your request, our team will reach out
          to verify your church details and set up your payment account. You'll receive a USSD code and payment
          portal link once your account is ready.
        </p>
      </div>
    </div>
  );
}

/* ─── About Tab ─── */
function AboutTab({ version }: { version: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">About WorshipHQ Desktop</h2>
        <p className="text-sm text-ink-muted">Offline-first church management.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <img src="./icon.png" alt="" className="size-14 object-contain" />
          <div>
            <p className="text-lg font-bold text-ink">WorshipHQ</p>
            <p className="text-sm text-ink-muted">Church Management System</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div><p className="text-xs text-ink-faint">Version</p><p className="text-sm font-medium text-ink">v{version}</p></div>
          <div><p className="text-xs text-ink-faint">Platform</p><p className="text-sm font-medium text-ink">Windows Desktop</p></div>
          <div><p className="text-xs text-ink-faint">Engine</p><p className="text-sm font-medium text-ink">Electron + SQLite</p></div>
          <div><p className="text-xs text-ink-faint">Sync</p><p className="text-sm font-medium text-ink">Bi-directional</p></div>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-xs text-ink-faint">
            WorshipHQ Desktop works fully offline and syncs with your cloud account when connected.
          </p>
        </div>

        <button onClick={() => window.api?.openExternal("https://worshiphq.app")}
          className="flex items-center gap-2 text-sm text-primary-bright hover:underline">
          <ExternalLink className="size-3.5" /> Visit worshiphq.app
        </button>
      </div>
    </div>
  );
}
