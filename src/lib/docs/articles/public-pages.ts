import type { DocArticle } from "../types";

export const publicPages: DocArticle[] = [
  {
    slug: "sharing-links",
    section: "public-pages",
    title: "Your shared links at a glance",
    summary: "The links members and visitors use, where to find them, and how to share them.",
    appPath: "/app/settings",
    body: [
      { p: "Your church has a set of public pages that anyone can open on their phone, with no login. Most are in **Settings**, then **Links & forms**, each with **Copy** and **Open**. The giving link is at the top of **Giving** (with a QR code), and each service's check-in link and QR code are on that service's page." },
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
    slug: "qr-posters",
    section: "public-pages",
    title: "Make a QR poster to print",
    summary: "Design a poster for your visitor form, check-in, giving and more, then print it or save it as a PDF.",
    appPath: "/app/settings",
    feature: "poster-maker",
    body: [
      { p: "Every link in **Settings**, then **Links & forms**, has a **QR** button that shows the code on screen. On **Starter** and above it also has a **Poster** button, which turns the code into a poster ready for your door, noticeboard or WhatsApp status. The check-in page has the same button under its code." },
      { steps: [
        "Go to **Settings**, then **Links & forms**, and choose **Poster** on the link you want (for example **Visitor form**).",
        "Pick a **Look**: Classic, Bold or Minimal. Choose your **Size**: A3, A4, A5, A6, a square for WhatsApp, a story for phone screens, or your own size in centimetres. Posters can stand upright or sideways.",
        "Change the headline and the message, or switch them off. Edit the three **how to scan** steps, or clear one to remove it. Use **Add a line** for service times, your address or a phone number.",
        "Use **Show or hide** to take off the church name, logo or web address. Choose your colours and slide the **Code size** and **Text size** until it looks right.",
        "Choose **Download PDF** (best for a print shop), **Picture (PNG)** for WhatsApp, or **Print**.",
      ] },
      { list: [
        "The preview is exactly what you get. Nothing is cut off: if you add too much, the text shrinks to fit.",
        "A small **Made with WorshipHQ** line sits at the bottom. It can be removed on the **Max** plan.",
        "Check-in codes: a code from a service you started by hand belongs to that one service. If you use **service times**, the code always goes to the service that is on, so one printed poster works every week.",
      ] },
      { tip: "Test the printed poster with your own phone camera before you put it up. Dark codes on a light background scan best." },
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
      { p: "Both forms can be customised in **Settings**, **Links & forms**. A parent or guardian must confirm consent before a child's details are saved." },
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
      { p: "You can change the questions on the giving page, add your own, and show it in steps under **Settings**, **Links & forms**, **Online giving**, **Customize form**. The amount and what they give towards are always there." },
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
      { p: "Each of these forms can be customised, and shown in steps, under **Settings**, **Links & forms**, **Customize form**. See **Choose what your forms ask for**." },
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
        "If the church asks for it, allow the phone to share its location so we can see you are at church.",
        "Type your name or phone number, then tap your name in the list.",
        "Tap **Yes, that is me**. Depending on the church's rules you may also type the last 3 digits of your phone number, or the 6-digit code we text you.",
        "A confirmation page shows you are checked in.",
      ] },
      { p: "New here? Tap **I am new here**, enter your name and phone number, and you are checked in and welcomed. If we already know your number, search for your name instead. Checking in twice doesn't count twice." },
    ],
  },
];
