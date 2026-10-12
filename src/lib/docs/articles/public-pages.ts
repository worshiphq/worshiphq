import type { DocArticle } from "../types";

export const publicPages: DocArticle[] = [
  {
    slug: "sharing-links",
    section: "public-pages",
    title: "Your shared links at a glance",
    summary: "The links members and visitors use, where to find them, and how to share them.",
    appPath: "/app/settings",
    body: [
      { p: "Your church has a set of public pages that anyone can open on their phone, with no login. Most are in **Settings**, then **Join link**, each with **Copy** and **Open**. The giving link is at the top of **Giving** (with a QR code), and each service's check-in link and QR code are on that service's page." },
      { table: { head: ["Link", "What it's for"], rows: [
        ["**Join**", "New members register themselves."],
        ["**Visit**", "First-time visitors leave their details."],
        ["**Children** and **Teens**", "Parents register children; teens register themselves."],
        ["**Give**", "Give online by Mobile Money or card."],
        ["**Pray**", "Send a prayer request."],
        ["**Testify**", "Share a testimony."],
        ["**Counsel**", "Privately request counselling."],
        ["**Check-in**", "Members check themselves in to a service (from the service page)."],
      ] } },
      { tip: "Paste the links into your church WhatsApp groups, put them on the screen during announcements, or turn them into QR codes for posters." },
    ],
  },
  {
    slug: "join-form",
    section: "public-pages",
    title: "Member self-registration (join link)",
    summary: "How members register themselves, and what happens next.",
    body: [
      { steps: [
        "The member opens your join link (or scans its QR code).",
        "They fill in the form: the fields you chose, their departments, and their zone and fellowship if you ask for them.",
        "They choose **Submit registration**.",
      ] },
      { list: [
        "They appear in **People** straight away, with their own member ID.",
        "If switched on, they get a welcome text, and a follow-up is created so someone welcomes them personally.",
        "Admins can be notified of each new registration (Settings, Church profile).",
      ] },
    ],
  },
  {
    slug: "visitor-form",
    section: "public-pages",
    title: "Visitor form link",
    summary: "How first-time visitors leave their details from their phones.",
    body: [
      { steps: [
        "The visitor opens your visitor link or scans its QR code (e.g. on a card at the door).",
        "They enter their name, phone, purpose of visit, who invited them, an optional photo and any prayer request.",
        "They choose **Submit visitor form**.",
      ] },
      { list: [
        "They're added to **Visitors** (and to People as a visitor).",
        "They get your welcome text, if switched on.",
        "A follow-up task is created and sent to your follow-up lead.",
      ] },
    ],
  },
  {
    slug: "children-teens-forms",
    section: "public-pages",
    title: "Children's and teens' registration forms",
    summary: "Let parents register their children, and teens register themselves.",
    body: [
      { p: "Share the **Children's registration** link with parents. It collects the child's details plus guardian details, school and class. The **Teens registration** link lets teens register and choose the departments they serve in." },
      { p: "Both forms can be customised in **Settings**, **Join link**. A parent or guardian must confirm consent before a child's details are saved." },
    ],
  },
  {
    slug: "giving-link",
    section: "public-pages",
    title: "Online giving link",
    summary: "How members give from their phones by Mobile Money or card.",
    appPath: "/app/giving",
    body: [
      { p: "Your online giving link is shown at the top of the **Giving** page, with a QR code and **Preview**. Online giving must be set up first (see **Set up online giving**)." },
      { h: "What the giver does" },
      { steps: [
        "Open the giving link or scan the QR code.",
        "Enter **Your details**: name, phone and email (optional).",
        "Enter the **Amount (₵)** and choose what to **Give towards**: Offertory, Tithes, Church Blessing, Pledge (with what it's for), Harvest, or type their own.",
        "Continue and pay by Mobile Money or card on the secure Paystack screen.",
        "They see a thank-you page and get a receipt.",
      ] },
      { p: "The gift appears in **Giving** automatically, under the right fund, and the money is paid into the church's own account." },
      { note: "A small processing fee may be added on top of the amount, so the church receives the full gift. The giver sees the exact amount before paying." },
    ],
  },
  {
    slug: "prayer-testimony-counselling",
    section: "public-pages",
    title: "Prayer, testimony and counselling links",
    summary: "Let members send prayer requests, testimonies and counselling requests from their phones.",
    body: [
      { h: "Prayer requests" },
      { p: "Members enter their name and prayer request, or tick **Submit anonymously**. It appears in **Prayer requests**." },
      { h: "Testimonies" },
      { p: "Members enter a title, category (Praise report, Healing, Provision, Deliverance, Salvation or Other) and their story, or **Share anonymously**. You review each one before it's published, and admins are notified." },
      { h: "Counselling requests" },
      { p: "Members enter their name, phone, what it's about (e.g. Marriage / family, Grief / loss, Financial) and how you can help. It's private: it opens a confidential case in **Counseling** and notifies your admins by SMS and email." },
    ],
  },
  {
    slug: "self-checkin-member",
    section: "public-pages",
    title: "Self check-in: what members see",
    summary: "How a member checks themselves in to a service with a QR code.",
    body: [
      { steps: [
        "Scan the service's check-in QR code with the phone camera.",
        "Enter **Your name** and phone (optional).",
        "Tap to check in. A confirmation page shows they're checked in.",
      ] },
      { p: "If we recognise them, they're checked in as themselves; otherwise they're recorded as a visitor. Checking in twice doesn't count twice." },
    ],
  },
];
