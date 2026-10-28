"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  Gift,
  LayoutDashboard,
  Link2,
  Lock,
  LogOut,
  MessageCircle,
  Network,
  Package,
  Percent,
  Rocket,
  Share2,
  Sparkles,
  Store,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoMark } from "@/components/logo";
import { PremiumArt } from "@/components/premium-art";
import { cn } from "@/lib/utils";
import type { MemberOverview, MemberPayout } from "@/lib/member-data";
import type { NetworkLevel } from "@/lib/affiliate";

type Tab = "overview" | "store" | "affiliate" | "tools";

/**
 * Cost of one metered AI search, mirrored from `SEARCH_COST_TOKENS` in
 * `lib/tokens.ts`. That module imports the Supabase server client, so importing
 * the constant directly would drag the service-role SDK into this client bundle.
 */
const SEARCH_COST_TOKENS = 10_000;
/** One USD buys one million tokens (`TOKENS_PER_USD` in `lib/pricing.ts`). */
const TOKENS_PER_USD = 1_000_000;

/* Dual-Tone: kad putih bersih dengan border nipis (gaya Dynadot body). */
const PANEL = "gap-0 rounded-2xl border border-slate-200 bg-white py-0 shadow-sm ring-0";

const RANKS = [
  { id: "pemula" as const, min: 0, icon: Flame },
  { id: "pencetus" as const, min: 1, icon: Zap },
  { id: "pembina" as const, min: 5, icon: Users },
  { id: "master" as const, min: 20, icon: Trophy },
  { id: "legenda" as const, min: 50, icon: Crown },
];

type DashLang = "ms" | "en" | "id";

/** Boss spec: BM | ID | EN — same order as the navbar switcher. */
const DASH_LANGS: Array<{ id: DashLang; label: string }> = [
  { id: "ms", label: "BM" },
  { id: "id", label: "ID" },
  { id: "en", label: "EN" },
];

const DASH_STR = {
  ms: {
    tabs: {
      overview: "Papan Pemuka",
      overviewHint: "Bisnes anda hari ini",
      store: "Kedai Saya",
      storeHint: "Pautan & langganan",
      affiliate: "Program Affiliate",
      affiliateHint: "Rakan rujukan",
      tools: "Alat AI",
      toolsHint: "Aplikasi bisnes",
    },
    ranks: [
      { name: "Pemula", blurb: "Langkah pertama. Kongsi pautan pertama anda." },
      { name: "Pencetus", blurb: "Rangkaian mula bergerak." },
      { name: "Pembina", blurb: "Komisen pasif mula masuk." },
      { name: "Master", blurb: "Rangkaian merentas beberapa level." },
      { name: "Legenda", blurb: "Pangkat tertinggi dalam matriks." },
    ],
    console: "Konsol ahli",
    memberAccount: "Akaun ahli",
    active: "aktif",
    token: "Token",
    searchesLeft: "carian AI berbaki",
    signOut: "Log keluar",
    sectionsLabel: "Bahagian dashboard",
    mainNav: "Navigasi utama",
    overviewEyebrow: "Papan Pemuka",
    greeting: "Selamat kembali",
    overviewSub: "Semua benda penting — token, kedai, rangkaian — satu tempat.",
    activeAccount: "Akaun aktif",
    affiliateLabel: "Afiliasi",
    tokenBalance: "Baki token",
    tokenUnit: "token",
    searches: "carian",
    valueSuffix: "nilai",
    searchCapacity: "Kapasiti carian",
    topUpTokens: "Jom Top-Up token",
    totalEarnings: "Jumlah pendapatan",
    available: "sedia",
    people: "orang",
    directVsPassive: "Komisen langsung vs rangkaian",
    openKuda: "Jom Buka Program Affiliate",
    network: "Rangkaian",
    deepest: "Kedalaman rangkaian",
    notStarted: "Belum bermula",
    shop: "Kedai",
    openedActive: "Aktif",
    notYet: "Belum",
    openedUnit: "dibuka",
    addFirstProduct: "Tambah produk pertama",
    rank: "Pangkat",
    moreToGo: "lagi",
    highest: "tertinggi",
    toNext: "ke",
    quickActions: "Tindakan pantas",
    topLinks: "3 pautan paling kerap",
    topUp: "Top-up token",
    fromPrice: "Serendah $1",
    writeAd: "Tulis iklan AI",
    freeTry: "Percuma cuba",
    manageShop: "Urus kedai",
    productsOrders: "Produk & pesanan",
    tokenUsage: "Penggunaan token",
    perSearch: "/carian",
    balance: "Baki",
    searchesLabel: "Carian",
    valueLabel: "Nilai",
    costPerSearch: "Kos setiap carian AI",
    tokenRate: "Kadar token",
    tokenRateValue: "1,000,000 token = $1.00",
    balanceStatus: "Status baki",
    sufficient: "Mencukupi",
    needTopUp: "Dah nak habis — jom top-up",
    recentPayouts: "Pembayaran terkini",
    viewAll: "Semua",
    noPayouts: "Belum ada pembayaran",
    commissionAfterRequest: "Duit komisen yang dah masuk akan nampak kat sini lepas request pertama.",
    storeEyebrow: "Kedai Saya",
    storeTitle: "Pautan, produk & langganan",
    storeSub: "Semua yang customer nampak bila buka kedai anda. Kemas elok-elok ya!",
    shopLinkLabel: "Pautan kedai",
    shopNotOpened: "Belum dibuka",
    opened: "Dibuka",
    closed: "Ditutup",
    activeProducts: "produk aktif",
    trialLeftDays: "hari percubaan",
    trialActive: "Langganan aktif",
    noSubscription: "Tiada langganan",
    shopNotOpenedTitle: "Kedai anda belum buka lagi",
    shopNotOpenedDesc: "Tambah produk pertama, terus dapat pautan kedai untuk kongsi kat WhatsApp.",
    openShop: "Jom buka kedai",
    catalogTitle: "Katalog produk",
    catalogDesc: "Tambah barang, tukar harga, on/off produk — semua dari sini. Yang aktif je keluar kat halaman kedai.",
    shopStatus: "Status kedai",
    publicLink: "Pautan awam",
    activeValue: "Aktif",
    noneValue: "Belum ada",
    manageProducts: "Urus produk",
    pro: "Pro",
    shopRental: "Sewa Kedai",
    monthlyCancel: "Langganan bulanan · batal bila-bila",
    perMonth: "/ bulan",
    trialRemaining: "Percubaan berbaki",
    days: "hari",
    manageSubscription: "Urus langganan",
    notSubscribed: "Belum subscribe — ada 7 hari cuba percuma. Rugi tak cuba!",
    trialLeftDesc: "hari percubaan percuma berbaki.",
    subActiveDesc: "Langganan aktif. Kedai anda dibuka kepada pelanggan.",
    subExpiredDesc: "Langganan tamat. Kedai ditutup kepada pelanggan.",
    rentalFeatures: [
      "Kedai dibuka kepada pelanggan",
      "Pautan kedai boleh dikongsi",
      "7 hari percubaan percuma",
      "Urus produk dari dashboard",
    ],
    affiliateEyebrow: "Program Affiliate",
    shareBuild: "Kongsi & bina pendapatan",
    oneLink: "Satu pautan je. Dapatkan komisen tunai sehingga 70% daripada setiap pembelian software oleh rakan yang anda rujuk.",
    networkSize: "Jaringan",
    inNetwork: "orang dalam rangkaian",
    directCom: "Komisen Langsung",
    directHint: "50% setiap pembelian langsung",
    passiveNet: "Komisen Rangkaian",
    passiveHint: "Sehingga 20% daripada rangkaian anda",
    rankTitle: "Pangkat rangkaian",
    howToRank: "Cara naik pangkat",
    moreForNext: "orang lagi untuk",
    highestReached: "Pangkat tertinggi dicapai",
    networkTitle: "Rangkaian Anda",
    deepestLevel: "Kedalaman rangkaian",
    none: "—",
    networkNote: "Dapatkan komisen tunai sehingga 70% daripada setiap pembelian software oleh rakan yang anda rujuk — 50% komisen langsung dan sehingga 20% daripada rangkaian anda. Kongsi pautan, selebihnya automatik.",
    networkEmpty: "Rangkaian belum bermula",
    networkEmptyDesc: "Kongsi pautan kat atas tu. Setiap rakan yang menyertai dikira dalam rangkaian anda — makin ramai, makin masyuk.",
    withdrawable: "Boleh Tarik Duit",
    minPayout: "Cukup RM10 baru boleh tarik duit.",
    requestPayout: "Tarik Duit Sekarang",
    confirmRequest: "Sahkan permintaan",
    confirmDesc: "Jumlah di bawah akan diproses secara manual oleh admin. Baki rangkaian anda akan diselaraskan selepas pembayaran dibuat.",
    amount: "Jumlah",
    cancel: "Batal",
    sending: "Menghantar…",
    sendRequest: "Hantar permintaan",
    payoutOk: "Permintaan dihantar. Admin akan memproses pembayaran secara manual.",
    payoutEmpty: "Belum ada duit untuk tarik buat masa ni. Kumpul komisen dulu!",
    payoutMin: "Jumlah minimum pengeluaran ialah RM10.",
    payoutFail: "Permintaan gagal. Sila cuba lagi.",
    payoutNetwork: "Rangkaian bermasalah. Sila cuba lagi.",
    payoutHistory: "Sejarah pembayaran",
    noPayoutYet: "Belum ada pembayaran. Komisen terkumpul akan muncul di sini.",
    viewFullNetwork: "Lihat butiran rujukan",
    full19Desc: "Ringkasan komisen rakan yang anda rujuk",
    howToRankTitle: "Cara naik pangkat",
    howToRankDesc: "Pangkat dikira daripada jumlah orang dalam rangkaian anda. Semakin ramai menyertai, semakin tinggi pangkat dan semakin besar potensi komisen.",
    gotIt: "Faham",
    toolsEyebrow: "Alat AI",
    appsForBiz: "Aplikasi untuk bisnes anda",
    toolsSub: "Buka alat yang anda perlukan, terus dari dashboard.",
    toolAdName: "Penjana Iklan AI",
    toolAdDesc: "Tukar satu ayat produk kepada kapsyen TikTok atau Facebook.",
    toolAdTag: "Percuma cuba",
    toolBizName: "Biz-Match",
    toolBizDesc: "Cari pembekal borong di Malaysia dan Indonesia.",
    toolBizTag: "10,000 token",
    toolShopName: "Kedai Saya",
    toolShopDesc: "Urus produk, pesanan dan pautan kedai anda.",
    toolShopTag: "Termasuk",
    toolNetName: "Program Affiliate",
    toolNetDesc: "Pantau komisen dan tarik keluar baki anda.",
    toolNetTag: "Tunai",
    openAction: "Buka",
    needHelp: "Perlukan bantuan?",
    teamHelp: "Team kami boleh tolong siapkan kedai anda. Tanya je!",
    contactUs: "Chat kami",
    referralTitle: "Pautan rujukan anda",
    referralSub: "Kongsi pautan ni kat kawan-kawan. Setiap pembelian masuk terus ke poket rangkaian anda.",
    copyLink: "Salin pautan ni",
    copiedBtn: "Disalin!",
    manualCopyBtn: "Salin manual",
    shareWhatsapp: "Kongsi kat WhatsApp",
    rateNoteA: "Sehingga 70% komisen tunai",
    rateNoteB: "Rakan dirujuk: pembelian software",
    instantCredit: "Komisen masuk terus — tak payah tunggu",
    noAffiliateCode: "Belum ada kod afiliasi.",
    clipboardBlocked: "Pelayar menyekat papan keratan. Salin pautan di atas secara manual.",
    openNewTab: "Buka dalam tab baharu",
    copy: "Salin",
    copiedShort: "Disalin",
    manualShort: "Manual",
    linkWord: "Pautan",
    openWord: "Buka",
    shareText: "Sertai JutaOne.Biz — tulis iklan AI untuk bisnes anda. Guna pautan saya:",
    languageLabel: "Bahasa",
  },
  en: {
    tabs: {
      overview: "Overview",
      overviewHint: "Business today",
      store: "My Shop",
      storeHint: "Links & subscription",
      affiliate: "Affiliate Program",
      affiliateHint: "Referral partners",
      tools: "AI Tools",
      toolsHint: "Business apps",
    },
    ranks: [
      { name: "Starter", blurb: "First step. Share your first link." },
      { name: "Spark", blurb: "The network starts moving." },
      { name: "Builder", blurb: "Passive commission starts coming in." },
      { name: "Master", blurb: "Network spans multiple levels." },
      { name: "Legend", blurb: "Highest rank in the program." },
    ],
    console: "Member console",
    memberAccount: "Member account",
    active: "active",
    token: "Tokens",
    searchesLeft: "AI searches left",
    signOut: "Sign out",
    sectionsLabel: "Dashboard sections",
    mainNav: "Primary navigation",
    overviewEyebrow: "Overview",
    greeting: "Welcome back",
    overviewSub: "Your tokens, shop and network in one view.",
    activeAccount: "Active account",
    affiliateLabel: "Affiliate",
    tokenBalance: "Token balance",
    tokenUnit: "tokens",
    searches: "searches",
    valueSuffix: "value",
    searchCapacity: "Search capacity",
    topUpTokens: "Top up tokens",
    totalEarnings: "Total earnings",
    available: "available",
    people: "people",
    directVsPassive: "Direct vs network commission",
    openKuda: "Open Affiliate Program",
    network: "Network",
    deepest: "Network depth",
    notStarted: "Not started",
    shop: "Shop",
    openedActive: "Active",
    notYet: "Not",
    openedUnit: "open",
    addFirstProduct: "Add your first product",
    rank: "Rank",
    moreToGo: "more",
    highest: "highest",
    toNext: "to",
    quickActions: "Quick actions",
    topLinks: "3 most-used links",
    topUp: "Top up tokens",
    fromPrice: "From $1",
    writeAd: "Write AI ad",
    freeTry: "Free trial",
    manageShop: "Manage shop",
    productsOrders: "Products & orders",
    tokenUsage: "Token usage",
    perSearch: "/search",
    balance: "Balance",
    searchesLabel: "Searches",
    valueLabel: "Value",
    costPerSearch: "Cost per AI search",
    tokenRate: "Token rate",
    tokenRateValue: "1,000,000 tokens = $1.00",
    balanceStatus: "Balance status",
    sufficient: "Healthy",
    needTopUp: "Needs top-up",
    recentPayouts: "Recent payouts",
    viewAll: "View all",
    noPayouts: "No payouts yet",
    commissionAfterRequest: "Earned commission will appear here after your first request.",
    storeEyebrow: "My Shop",
    storeTitle: "Links, products & subscription",
    storeSub: "Everything customers see when they open your shop.",
    shopLinkLabel: "Shop link",
    shopNotOpened: "Not open yet",
    opened: "Open",
    closed: "Closed",
    activeProducts: "active products",
    trialLeftDays: "trial days",
    trialActive: "Active subscription",
    noSubscription: "No subscription",
    shopNotOpenedTitle: "Your shop is not open yet",
    shopNotOpenedDesc: "Add your first product to generate a shareable shop link.",
    openShop: "Open shop",
    catalogTitle: "Product catalogue",
    catalogDesc: "Add, update or deactivate products shown in your shop. Every active product appears on the public shop page.",
    shopStatus: "Shop status",
    publicLink: "Public link",
    activeValue: "Active",
    noneValue: "None yet",
    manageProducts: "Manage products",
    pro: "Pro",
    shopRental: "Shop Rental",
    monthlyCancel: "Monthly subscription · cancel anytime",
    perMonth: "/ month",
    trialRemaining: "Trial left",
    days: "days",
    manageSubscription: "Manage subscription",
    notSubscribed: "Not subscribed — 7-day free trial available.",
    trialLeftDesc: "free trial days left.",
    subActiveDesc: "Subscription active. Your shop is open to customers.",
    subExpiredDesc: "Subscription expired. Shop is closed to customers.",
    rentalFeatures: [
      "Shop open to customers",
      "Shareable shop link",
      "7-day free trial",
      "Manage products from dashboard",
    ],
    affiliateEyebrow: "Affiliate Program",
    shareBuild: "Share & grow earnings",
    oneLink: "One link. Earn up to 70% cash commission on every software purchase by members you refer.",
    networkSize: "Network",
    inNetwork: "people in your network",
    directCom: "Direct Commission",
    directHint: "50% of each direct purchase",
    passiveNet: "Network Commission",
    passiveHint: "Up to 20% across your network",
    rankTitle: "Network rank",
    howToRank: "How to rank up",
    moreForNext: "more for",
    highestReached: "Highest rank reached",
    networkTitle: "Your Network",
    deepestLevel: "Network depth",
    none: "—",
    networkNote: "Earn up to 70% cash commission on every software purchase by members you refer — 50% direct commission plus up to 20% from your network. Share your link and the rest is automatic.",
    networkEmpty: "Network not started",
    networkEmptyDesc: "Share the referral link above. Every member who joins counts toward your network — the more members, the more you earn.",
    withdrawable: "Withdrawable",
    minPayout: "Minimum payout RM10.",
    requestPayout: "Request payout",
    confirmRequest: "Confirm request",
    confirmDesc: "The amount below will be processed manually by an admin. Your network balance will be adjusted after payment.",
    amount: "Amount",
    cancel: "Cancel",
    sending: "Sending…",
    sendRequest: "Send request",
    payoutOk: "Request sent. An admin will process the payment manually.",
    payoutEmpty: "No balance available to withdraw right now.",
    payoutMin: "Minimum payout is RM10.",
    payoutFail: "Request failed. Please try again.",
    payoutNetwork: "Network issue. Please try again.",
    payoutHistory: "Payout history",
    noPayoutYet: "No payouts yet. Earned commission will appear here.",
    viewFullNetwork: "View referral details",
    full19Desc: "Commission summary for members you referred",
    howToRankTitle: "How to rank up",
    howToRankDesc: "Rank is counted from total people in your network. The more who join, the higher your rank and the bigger the commission potential.",
    gotIt: "Got it",
    toolsEyebrow: "AI Tools",
    appsForBiz: "Apps for your business",
    toolsSub: "Open the tool you need, right from the dashboard.",
    toolAdName: "AI Ad Generator",
    toolAdDesc: "Turn one product sentence into a TikTok or Facebook caption.",
    toolAdTag: "Free trial",
    toolBizName: "Biz-Match",
    toolBizDesc: "Find wholesale suppliers in Malaysia and Indonesia.",
    toolBizTag: "10,000 tokens",
    toolShopName: "My Shop",
    toolShopDesc: "Manage your products, orders and shop link.",
    toolShopTag: "Included",
    toolNetName: "Affiliate Program",
    toolNetDesc: "Track commission and withdraw your balance.",
    toolNetTag: "Cash",
    openAction: "Open",
    needHelp: "Need help?",
    teamHelp: "Our team can help set up your shop.",
    contactUs: "Contact us",
    referralTitle: "Your referral link",
    referralSub: "Share this link. Every purchase is recorded straight into your network.",
    copyLink: "Copy link",
    copiedBtn: "Copied!",
    manualCopyBtn: "Copy manually",
    shareWhatsapp: "Share via WhatsApp",
    rateNoteA: "Up to 70% cash commission",
    rateNoteB: "Referred members: software purchases",
    instantCredit: "Commission credited instantly",
    noAffiliateCode: "No affiliate code yet.",
    clipboardBlocked: "Browser blocked the clipboard. Copy the link above manually.",
    openNewTab: "Open in new tab",
    copy: "Copy",
    copiedShort: "Copied",
    manualShort: "Manual",
    linkWord: "Link",
    openWord: "Open",
    shareText: "Join JutaOne.Biz — write AI ads for your business. Use my link:",
    languageLabel: "Language",
  },
  id: {
    tabs: {
      overview: "Papan Pemuka",
      overviewHint: "Bisnis Anda hari ini",
      store: "Toko Saya",
      storeHint: "Tautan & langganan",
      affiliate: "Program Afiliasi",
      affiliateHint: "Mitra rujukan",
      tools: "Alat AI",
      toolsHint: "Aplikasi bisnis",
    },
    ranks: [
      { name: "Pemula", blurb: "Langkah pertama. Bagikan tautan pertama Anda." },
      { name: "Pemicu", blurb: "Jaringan mulai bergerak." },
      { name: "Pembangun", blurb: "Komisi pasif mulai masuk." },
      { name: "Master", blurb: "Jaringan menjangkau beberapa level." },
      { name: "Legenda", blurb: "Peringkat tertinggi dalam matriks." },
    ],
    console: "Konsol anggota",
    memberAccount: "Akun anggota",
    active: "aktif",
    token: "Token",
    searchesLeft: "pencarian AI tersisa",
    signOut: "Keluar",
    sectionsLabel: "Bagian dasbor",
    mainNav: "Navigasi utama",
    overviewEyebrow: "Papan Pemuka",
    greeting: "Selamat datang kembali",
    overviewSub: "Semua yang penting — token, toko, jaringan — dalam satu tempat.",
    activeAccount: "Akun aktif",
    affiliateLabel: "Afiliasi",
    tokenBalance: "Saldo token",
    tokenUnit: "token",
    searches: "pencarian",
    valueSuffix: "nilai",
    searchCapacity: "Kapasitas pencarian",
    topUpTokens: "Isi ulang token",
    totalEarnings: "Total penghasilan",
    available: "tersedia",
    people: "orang",
    directVsPassive: "Komisi langsung vs jaringan",
    openKuda: "Buka Program Afiliasi",
    network: "Jaringan",
    deepest: "Kedalaman rangkaian",
    notStarted: "Belum mulai",
    shop: "Toko",
    openedActive: "Aktif",
    notYet: "Belum",
    openedUnit: "dibuka",
    addFirstProduct: "Tambah produk pertama",
    rank: "Peringkat",
    moreToGo: "lagi",
    highest: "tertinggi",
    toNext: "ke",
    quickActions: "Tindakan cepat",
    topLinks: "3 tautan tersering",
    topUp: "Isi ulang token",
    fromPrice: "Dari $1",
    writeAd: "Tulis iklan AI",
    freeTry: "Coba gratis",
    manageShop: "Kelola toko",
    productsOrders: "Produk & pesanan",
    tokenUsage: "Penggunaan token",
    perSearch: "/pencarian",
    balance: "Saldo",
    searchesLabel: "Pencarian",
    valueLabel: "Nilai",
    costPerSearch: "Biaya per pencarian AI",
    tokenRate: "Kurs token",
    tokenRateValue: "1.000.000 token = $1,00",
    balanceStatus: "Status saldo",
    sufficient: "Cukup",
    needTopUp: "Perlu isi ulang",
    recentPayouts: "Pembayaran terkini",
    viewAll: "Semua",
    noPayouts: "Belum ada pembayaran",
    commissionAfterRequest: "Komisi yang terkumpul akan muncul di sini setelah permintaan pertama.",
    storeEyebrow: "Toko Saya",
    storeTitle: "Tautan, produk & langganan",
    storeSub: "Semua yang pelanggan lihat saat membuka toko Anda.",
    shopLinkLabel: "Tautan toko",
    shopNotOpened: "Belum dibuka",
    opened: "Dibuka",
    closed: "Ditutup",
    activeProducts: "produk aktif",
    trialLeftDays: "hari uji coba",
    trialActive: "Langganan aktif",
    noSubscription: "Tanpa langganan",
    shopNotOpenedTitle: "Toko Anda belum dibuka",
    shopNotOpenedDesc: "Tambah produk pertama untuk membuat tautan toko yang bisa dibagikan.",
    openShop: "Buka toko",
    catalogTitle: "Katalog produk",
    catalogDesc: "Tambah, perbarui, atau nonaktifkan produk yang tampil di toko Anda. Setiap produk aktif muncul di halaman publik toko.",
    shopStatus: "Status toko",
    publicLink: "Tautan publik",
    activeValue: "Aktif",
    noneValue: "Belum ada",
    manageProducts: "Kelola produk",
    pro: "Pro",
    shopRental: "Sewa Toko",
    monthlyCancel: "Langganan bulanan · batal kapan saja",
    perMonth: "/ bulan",
    trialRemaining: "Sisa uji coba",
    days: "hari",
    manageSubscription: "Kelola langganan",
    notSubscribed: "Belum berlangganan — uji coba gratis 7 hari tersedia.",
    trialLeftDesc: "hari uji coba gratis tersisa.",
    subActiveDesc: "Langganan aktif. Toko Anda terbuka untuk pelanggan.",
    subExpiredDesc: "Langganan berakhir. Toko tutup untuk pelanggan.",
    rentalFeatures: [
      "Toko terbuka untuk pelanggan",
      "Tautan toko bisa dibagikan",
      "Uji coba gratis 7 hari",
      "Kelola produk dari dasbor",
    ],
    affiliateEyebrow: "Program Afiliasi",
    shareBuild: "Bagikan & kembangkan penghasilan",
    oneLink: "Satu tautan. Dapatkan komisi tunai hingga 70% dari setiap pembelian software oleh anggota yang Anda rujuk.",
    networkSize: "Jaringan",
    inNetwork: "orang dalam jaringan Anda",
    directCom: "Komisi Langsung",
    directHint: "50% setiap pembelian langsung",
    passiveNet: "Komisi Jaringan",
    passiveHint: "Hingga 20% dari jaringan Anda",
    rankTitle: "Peringkat jaringan",
    howToRank: "Cara naik peringkat",
    moreForNext: "orang lagi untuk",
    highestReached: "Peringkat tertinggi tercapai",
    networkTitle: "Jaringan Anda",
    deepestLevel: "Kedalaman jaringan",
    none: "—",
    networkNote: "Dapatkan komisi tunai hingga 70% dari setiap pembelian software oleh anggota yang Anda rujuk — 50% komisi langsung ditambah hingga 20% dari jaringan Anda. Bagikan tautan, sisanya otomatis.",
    networkEmpty: "Jaringan belum mulai",
    networkEmptyDesc: "Bagikan tautan rujukan di atas. Setiap anggota yang bergabung dihitung dalam jaringan Anda — semakin ramai, semakin besar penghasilan.",
    withdrawable: "Bisa Tarik Duit",
    minPayout: "Cukup RM10 baru bisa tarik duit.",
    requestPayout: "Tarik Duit Sekarang",
    confirmRequest: "Konfirmasi permintaan",
    confirmDesc: "Jumlah di bawah akan diproses manual oleh admin. Saldo jaringan Anda akan disesuaikan setelah pembayaran dibuat.",
    amount: "Jumlah",
    cancel: "Batal",
    sending: "Mengirim…",
    sendRequest: "Kirim permintaan",
    payoutOk: "Permintaan terkirim. Admin akan memproses pembayaran secara manual.",
    payoutEmpty: "Belum ada duit untuk ditarik. Kumpulkan komisi dulu ya!",
    payoutMin: "Jumlah minimum penarikan adalah RM10.",
    payoutFail: "Permintaan gagal. Silakan coba lagi.",
    payoutNetwork: "Jaringan bermasalah. Silakan coba lagi.",
    payoutHistory: "Riwayat pembayaran",
    noPayoutYet: "Belum ada pembayaran. Komisi yang terkumpul akan muncul di sini.",
    viewFullNetwork: "Lihat detail rujukan",
    full19Desc: "Ringkasan komisi anggota yang Anda rujuk",
    howToRankTitle: "Cara naik peringkat",
    howToRankDesc: "Peringkat dihitung dari total orang dalam jaringan Anda. Semakin banyak yang bergabung, semakin tinggi peringkat dan potensi komisinya.",
    gotIt: "Mengerti",
    toolsEyebrow: "Alat AI",
    appsForBiz: "Aplikasi untuk bisnis Anda",
    toolsSub: "Buka alat yang Anda butuhkan, langsung dari dasbor.",
    toolAdName: "Generator Iklan AI",
    toolAdDesc: "Ubah satu kalimat produk menjadi caption TikTok atau Facebook.",
    toolAdTag: "Coba gratis",
    toolBizName: "Biz-Match",
    toolBizDesc: "Cari pemasok grosir di Malaysia dan Indonesia.",
    toolBizTag: "10.000 token",
    toolShopName: "Toko Saya",
    toolShopDesc: "Kelola produk, pesanan, dan tautan toko Anda.",
    toolShopTag: "Termasuk",
    toolNetName: "Program Afiliasi",
    toolNetDesc: "Pantau komisi dan tarik saldo Anda.",
    toolNetTag: "Tunai",
    openAction: "Buka",
    needHelp: "Butuh bantuan?",
    teamHelp: "Tim kami dapat membantu menyiapkan toko Anda.",
    contactUs: "Hubungi kami",
    referralTitle: "Tautan rujukan Anda",
    referralSub: "Bagikan tautan ini. Setiap pembelian tercatat langsung ke jaringan Anda.",
    copyLink: "Salin tautan",
    copiedBtn: "Disalin!",
    manualCopyBtn: "Salin manual",
    shareWhatsapp: "Bagikan WhatsApp",
    rateNoteA: "Komisi tunai hingga 70%",
    rateNoteB: "Anggota dirujuk: pembelian software",
    instantCredit: "Komisi dikredit seketika",
    noAffiliateCode: "Belum ada kode afiliasi.",
    clipboardBlocked: "Browser memblokir papan klip. Salin tautan di atas secara manual.",
    openNewTab: "Buka di tab baru",
    copy: "Salin",
    copiedShort: "Disalin",
    manualShort: "Manual",
    linkWord: "Tautan",
    openWord: "Buka",
    shareText: "Gabung JutaOne.Biz — tulis iklan AI untuk bisnis Anda. Gunakan tautan saya:",
    languageLabel: "Bahasa",
  },
} as const;

type DashDict =
  | (typeof DASH_STR)["ms"]
  | (typeof DASH_STR)["en"]
  | (typeof DASH_STR)["id"];

function LangSwitch({
  lang,
  onChange,
  label,
}: {
  lang: DashLang;
  onChange: (next: DashLang) => void;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
    >
      {DASH_LANGS.map((entry) => {
        const selected = entry.id === lang;
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onChange(entry.id)}
            aria-pressed={selected}
            className={cn(
              "min-h-[28px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
              selected ? "bg-brand text-white shadow-sm" : "text-slate-500 hover:text-slate-900",
            )}
          >
            {entry.label}
          </button>
        );
      })}
    </nav>
  );
}

function money(minor: number, currency: string): string {
  const value = minor / 100;
  if (currency === "IDR") return `Rp${value.toLocaleString("id-ID")}`;
  return `RM${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compact(value: number): string {
  return value.toLocaleString("en-US");
}

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "JO";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * Clipboard with the legacy fallback.
 *
 * `navigator.clipboard` is undefined on http origins and in several in-app
 * browsers — exactly where a merchant copies a referral link. A dead "Copy"
 * button costs a referral, so a failure is surfaced instead of swallowed.
 */
function useClipboard(value: string) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  function mark(next: "copied" | "failed") {
    setState(next);
    window.setTimeout(() => setState("idle"), 2200);
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        mark("copied");
        return;
      }
    } catch {
      // fall through to the legacy path
    }

    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      mark(ok ? "copied" : "failed");
    } catch {
      mark("failed");
    }
  }

  return { state, copy };
}

function Pill({
  children,
  tone = "emerald",
  className,
}: {
  children: ReactNode;
  tone?: "emerald" | "amber" | "blue" | "slate" | "violet";
  className?: string;
}) {
  const tones = {
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-700",
    blue: "border-brand/30 bg-brand/10 text-brand-deep",
    slate: "border-slate-200 bg-slate-50 text-slate-500",
    violet: "border-violet-500/25 bg-violet-500/10 text-violet-700",
  } as const;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

function IconTile({
  icon: Icon,
  tone = "brand",
  size = "md",
}: {
  icon: typeof Wallet;
  tone?: "brand" | "emerald" | "amber" | "violet" | "slate";
  size?: "sm" | "md" | "lg";
}) {
  const tones = {
    brand: "bg-brand/12 text-brand ring-brand/25",
    emerald: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25",
    amber: "bg-amber-400/12 text-amber-700 ring-amber-400/25",
    violet: "bg-violet-500/12 text-violet-700 ring-violet-500/25",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
  } as const;

  const sizes = {
    sm: "h-9 w-9 rounded-xl [&>svg]:size-4",
    md: "h-11 w-11 rounded-xl [&>svg]:size-[18px]",
    lg: "h-14 w-14 rounded-2xl [&>svg]:size-6",
  } as const;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center ring-1 ring-inset",
        tones[tone],
        sizes[size],
      )}
    >
      <Icon />
    </span>
  );
}

function CopyField({
  value,
  label,
  onOpen,
  copyLabel,
  copiedLabel,
  manualLabel,
  openTip,
  openWord,
  linkWord,
  blocked,
}: {
  value: string;
  label: string;
  onOpen?: string | null;
  copyLabel: string;
  copiedLabel: string;
  manualLabel: string;
  openTip: string;
  openWord: string;
  linkWord: string;
  blocked: string;
}) {
  const { state, copy } = useClipboard(value);

  return (
    <div className="space-y-1.5">
      <div className="group flex items-stretch gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 transition-colors focus-within:border-brand/40">
        <span className="hidden items-center pl-2 text-slate-400 sm:flex">
          <Link2 className="size-4" />
        </span>
        <Input
          readOnly
          value={value}
          aria-label={`${linkWord} ${label}`}
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 font-mono text-xs text-slate-700 shadow-none focus-visible:ring-0"
        />
        {onOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <a href={onOpen} target="_blank" rel="noopener noreferrer" aria-label={`${openWord} ${label}`}>
                  <ExternalLink />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{openTip}</TooltipContent>
          </Tooltip>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          className={cn(
            "h-9 shrink-0 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs font-medium",
            state === "failed"
              ? "text-amber-700"
              : "text-slate-600 hover:border-brand/40 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {state === "copied" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          {state === "copied" ? copiedLabel : state === "failed" ? manualLabel : copyLabel}
        </Button>
      </div>
      {state === "failed" && (
        <p role="alert" className="text-[11px] leading-relaxed text-amber-700">
          {blocked}
        </p>
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "default";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right text-xs font-medium break-words tabular-nums",
          tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function MemberDashboard({
  overview,
  payouts,
  name,
  levels = null,
}: {
  overview: MemberOverview | null | undefined;
  payouts: MemberPayout[] | null | undefined;
  name: string | null | undefined;
  /** Per-tier referral rows; `null` when the member has no code yet. */
  levels?: NetworkLevel[] | null;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [requesting, setRequesting] = useState(false);
  const [requestNote, setRequestNote] = useState<string | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [lang, setLang] = useState<DashLang>("ms");
  const t = DASH_STR[lang];

  const activeLevels = useMemo(
    () => (levels ?? []).filter((level) => level.people > 0),
    [levels],
  );

  // Hard guard AFTER hooks (rules-of-hooks): server loader always sends a
  // full overview, but a null here (DB outage, stale Worker bundle, bad
  // props) used to throw during render and Next showed "Application error: a
  // client-side exception". Render a plain retry state instead so the
  // dashboard never whitescreens.
  if (!overview || !overview.affiliate || !overview.store) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm font-semibold text-white">Data dashboard tiada buat masa ini</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Sila muat semula halaman. Jika masih berlaku, log keluar dan log masuk semula.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-brand min-h-[44px] px-4 py-2 text-sm"
          >
            Muat semula
          </button>
          <button
            type="button"
            onClick={() => {
              fetch("/api/auth", { method: "DELETE" }).finally(() => {
                window.location.href = "/login?next=/dashboard";
              });
            }}
            className="min-h-[44px] rounded-lg border border-line px-4 py-2 text-sm text-silver"
          >
            Log masuk semula
          </button>
        </div>
      </div>
    );
  }

  const safePayouts: MemberPayout[] = Array.isArray(payouts) ? payouts : [];
  const safeName = typeof name === "string" && name.trim() ? name : "rakan";

  const TABS_UI = [
    { id: "overview" as const, label: t.tabs.overview, hint: t.tabs.overviewHint, icon: LayoutDashboard, art: null as string | null },
    { id: "store" as const, label: t.tabs.store, hint: t.tabs.storeHint, icon: Store, art: null as string | null },
    { id: "affiliate" as const, label: t.tabs.affiliate, hint: t.tabs.affiliateHint, icon: Network, art: null as string | null },
    { id: "tools" as const, label: t.tabs.tools, hint: t.tabs.toolsHint, icon: Sparkles, art: "/assets/ai-robot.jpg" as string | null },
  ];

  const RANKS_UI = RANKS.map((rank, index) => ({
    ...rank,
    name: t.ranks[index].name,
    blurb: t.ranks[index].blurb,
  }));

  const { tokens, affiliate, store } = overview;
  const totalEarnings = affiliate.directMinor + affiliate.passiveMinor;

  const searchesLeft = Math.floor(tokens / SEARCH_COST_TOKENS);
  const tokenValueUsd = tokens / TOKENS_PER_USD;
  // Capacity bar: 50 searches is the point where topping up is worth a nudge.
  const capacityPercent = Math.max(2, Math.min(100, Math.round((searchesLeft / 50) * 100)));

  const directShare = totalEarnings > 0 ? Math.round((affiliate.directMinor / totalEarnings) * 100) : 0;

  const trialDays = store.trialDaysLeft ?? 0;
  const trialPercent = Math.max(0, Math.min(100, Math.round((trialDays / 7) * 100)));

  const rankIndex = RANKS_UI.reduce(
    (best, rank, index) => (affiliate.networkSize >= rank.min ? index : best),
    0,
  );
  const currentRank = RANKS_UI[rankIndex];
  const nextRank = RANKS_UI[rankIndex + 1] ?? null;
  const peopleToNext = nextRank ? Math.max(0, nextRank.min - affiliate.networkSize) : 0;
  const rankPercent = nextRank
    ? Math.min(
        100,
        Math.round(((affiliate.networkSize - currentRank.min) / (nextRank.min - currentRank.min)) * 100),
      )
    : 100;

  const referralUrl = affiliate.code ? `jutaone.biz/?ref=${affiliate.code}` : null;
  const referralHref = referralUrl ? `https://${referralUrl}` : null;
  const shopUrl = store.slug ? `jutaone.biz/shop/${store.slug}` : null;
  const shareHref = referralHref
    ? `https://wa.me/?text=${encodeURIComponent(`${t.shareText} ${referralHref}`)}`
    : null;

  const deepestLevel = activeLevels.reduce((deep, level) => Math.max(deep, level.level), 0);

  async function requestPayout() {
    setRequesting(true);
    setRequestNote(null);
    try {
      const response = await fetch("/api/affiliate/payout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_minor: affiliate.availableMinor }),
      });
      const data = await response.json();
      setRequestNote(
        response.ok && data.ok
          ? t.payoutOk
          : data.code === "nothing_available"
            ? t.payoutEmpty
            : data.code === "below_minimum"
              ? t.payoutMin
              : t.payoutFail,
      );
    } catch {
      setRequestNote(t.payoutNetwork);
    } finally {
      setRequesting(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto flex w-full max-w-[1180px] gap-6 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-8">
        <aside className="hidden w-[252px] shrink-0 lg:block">
          <div className="panel sticky top-5 flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-4">
            <div className="aurora -top-16 -left-10 h-40 w-40 bg-brand/15" />
            <div className="relative flex items-center gap-2.5 px-1.5">
              <LogoMark size={40} className="h-auto w-10 shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-semibold tracking-[0.2em] text-muted uppercase">
                  JutaOne.Biz
                </p>
                <p className="truncate text-sm font-semibold text-white">{t.console}</p>
              </div>
            </div>

            <div className="relative mt-4 flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand/30 to-brand/5 text-[11px] font-semibold text-brand-soft ring-1 ring-brand/25 ring-inset">
                {initials(safeName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">{safeName}</p>
                <p className="text-[10px] text-muted">{t.memberAccount}</p>
              </div>
              <Pill tone="emerald" className="px-1.5 py-0.5 text-[9px]">
                {t.active}
              </Pill>
            </div>

            <nav aria-label={t.sectionsLabel} className="relative mt-5 space-y-1" role="tablist">
              {TABS_UI.map((entry) => {
                const Icon = entry.icon;
                const active = tab === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    id={`tab-${entry.id}`}
                    aria-selected={active}
                    aria-controls={`panel-${entry.id}`}
                    onClick={() => setTab(entry.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all",
                      active
                        ? "bg-gradient-to-r from-brand/18 via-brand/[0.06] to-transparent text-white ring-1 ring-brand/25 ring-inset"
                        : "text-muted hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    {entry.art ? (
                      <PremiumArt src={entry.art} alt="" size={22} glow="cyan" rounded="rounded-lg" />
                    ) : (
                      <Icon className={cn("size-[17px] shrink-0", active && "text-brand")} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{entry.label}</span>
                      <span
                        className={cn(
                          "block truncate text-[10px]",
                          active ? "text-brand-soft/80" : "text-muted/70",
                        )}
                      >
                        {entry.hint}
                      </span>
                    </span>
                    {active && <ChevronRight className="size-3.5 shrink-0 text-brand" />}
                  </button>
                );
              })}
            </nav>

            <div className="relative mt-auto space-y-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-muted uppercase">
                    <Wallet className="size-3.5 text-brand" /> {t.token}
                  </span>
                  <span className="text-[10px] text-muted tabular-nums">≈{searchesLeft}</span>
                </div>
                <p className="mt-1 text-lg font-semibold text-white tabular-nums">{compact(tokens)}</p>
                <Progress
                  value={capacityPercent}
                  className="mt-2 h-1 bg-white/[0.08] [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-brand [&>[data-slot=progress-indicator]]:to-sky-400"
                />
                <p className="mt-1.5 text-[10px] text-muted">≈ {searchesLeft} {t.searchesLeft}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <LogOut className="size-4" />
                {t.signOut}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {tab === "overview" && (
            <section
              id="panel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              className="space-y-4"
            >
              <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                    {t.overviewEyebrow}
                  </p>
                  <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.03em] text-slate-900 break-words sm:text-3xl">
                    {t.greeting}, {safeName}
                  </h1>
                  <p className="mt-1 text-[13px] text-slate-500">
                    {t.overviewSub}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <LangSwitch lang={lang} onChange={setLang} label={t.languageLabel} />
                  <Pill>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_1px_rgba(52,211,153,0.7)]" />
                    {t.activeAccount}
                  </Pill>
                </div>
              </header>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className={cn(PANEL, "border-brand/30")}>
                  <CardContent className="relative p-5">
                    <div className="flex items-start justify-between">
                      <PremiumArt src="/assets/token.jpg" alt={t.tokenBalance} size={56} glow="cyan" />
                      <Pill tone="blue">
                        <CircleDollarSign className="size-3" /> {t.token}
                      </Pill>
                    </div>

                    <p className="mt-5 text-[10px] tracking-[0.16em] text-slate-500 uppercase">{t.tokenBalance}</p>
                    <div className="mt-1 flex items-end gap-2">
                      <p className="text-[clamp(2rem,8vw,2.5rem)] leading-none font-semibold tracking-[-0.03em] text-slate-900 tabular-nums break-all">
                        {compact(tokens)}
                      </p>
                      <span className="pb-1 shrink-0 text-[11px] text-slate-500">{t.tokenUnit}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                        <Rocket className="size-3" /> ≈ {searchesLeft} {t.searches}
                      </span>
                      <span className="text-slate-500">≈ ${tokenValueUsd.toFixed(2)} {t.valueSuffix}</span>
                    </div>

                    <Separator className="my-4 bg-slate-100" />

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{t.searchCapacity}</span>
                      <span className="tabular-nums">{searchesLeft}/50</span>
                    </div>
                    <Progress
                      value={capacityPercent}
                      className="mt-2 h-1.5 bg-slate-100 [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-brand [&>[data-slot=progress-indicator]]:to-sky-400"
                    />

                    <Button
                      asChild
                      className="cta-glow mt-4 h-10 w-full gap-1.5 rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover"
                    >
                      <Link href={`/${lang}#pricing`}>
                        {t.topUpTokens} <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className={cn(PANEL, "border-emerald-200")}>
                  <CardContent className="relative p-5">
                    <div className="flex items-start justify-between">
                      <IconTile icon={Network} tone="emerald" />
                      <Pill>
                        <Percent className="size-3" /> {t.affiliateLabel}
                      </Pill>
                    </div>

                    <p className="mt-5 text-[10px] tracking-[0.16em] text-slate-500 uppercase">
                      {t.totalEarnings}
                    </p>
                    <div className="mt-1 flex items-end gap-2">
                      <p className="text-[clamp(1.6rem,7vw,2.5rem)] leading-none font-semibold tracking-[-0.03em] text-slate-900 tabular-nums break-all">
                        {money(totalEarnings, affiliate.currency)}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                        <Wallet className="size-3" /> {money(affiliate.availableMinor, affiliate.currency)} {t.available}
                      </span>
                      <span className="text-slate-500">{affiliate.networkSize} {t.people}</span>
                    </div>

                    <Separator className="my-4 bg-slate-100" />

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{t.directVsPassive}</span>
                      <span className="tabular-nums">{directShare}% / {100 - directShare}%</span>
                    </div>
                    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                        style={{ width: `${directShare}%` }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-sky-400/80 to-brand/80"
                        style={{ width: `${100 - directShare}%` }}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTab("affiliate")}
                      className="mt-4 h-10 w-full gap-1.5 rounded-xl border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      {t.openKuda} <ArrowRight className="size-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: t.network,
                    value: `${affiliate.networkSize}`,
                    unit: t.people,
                    icon: Users,
                    tone: "brand" as const,
                    foot: deepestLevel > 0 ? `${t.deepest} ${deepestLevel}` : t.notStarted,
                  },
                  {
                    label: t.shop,
                    value: store.slug ? t.openedActive : t.notYet,
                    unit: t.openedUnit,
                    icon: Store,
                    tone: "emerald" as const,
                    foot: store.slug ?? t.addFirstProduct,
                  },
                  {
                    label: t.rank,
                    value: currentRank.name,
                    unit: nextRank ? `${peopleToNext} ${t.moreToGo}` : t.highest,
                    icon: currentRank.icon,
                    tone: "amber" as const,
                    foot: `${rankPercent}% ${t.toNext} ${nextRank?.name ?? t.ranks[4].name}`,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Card key={item.label} className={cn(PANEL, "panel-lift")}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <IconTile icon={Icon} tone={item.tone} size="sm" />
                          <span className="text-[9px] tracking-[0.14em] text-slate-500 uppercase">
                            {item.label}
                          </span>
                        </div>
                        <p className="mt-3 flex items-baseline gap-1.5">
                          <span className="truncate text-xl font-semibold text-slate-900">{item.value}</span>
                          <span className="shrink-0 text-[10px] text-slate-500">{item.unit}</span>
                        </p>
                        <p className="mt-1 truncate text-[10px] text-slate-500">{item.foot}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className={PANEL}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                      <Zap className="size-4 text-brand" /> {t.quickActions}
                    </h2>
                    <span className="text-[10px] text-slate-500">{t.topLinks}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: t.topUp, hint: t.fromPrice, href: `/${lang}#pricing`, icon: Wallet },
                      { label: t.writeAd, hint: t.freeTry, href: `/${lang}#demo`, icon: Sparkles },
                      { label: t.manageShop, hint: t.productsOrders, href: "/store", icon: Package },
                    ].map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link
                          key={action.label}
                          href={action.href}
                          className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-brand/40 hover:bg-slate-50"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand/20">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-slate-900">
                              {action.label}
                            </span>
                            <span className="block truncate text-[10px] text-slate-500">{action.hint}</span>
                          </span>
                          <ChevronRight className="size-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
                <Card className={PANEL}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                        <BarChart3 className="size-4 text-brand" /> {t.tokenUsage}
                      </h2>
                      <Pill tone="slate">{SEARCH_COST_TOKENS.toLocaleString("en-US")}{t.perSearch}</Pill>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { label: t.balance, value: compact(tokens) },
                        { label: t.searchesLabel, value: `${searchesLeft}` },
                        { label: t.valueLabel, value: `$${tokenValueUsd.toFixed(2)}` },
                      ].map((cell) => (
                        <div key={cell.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="truncate text-[9px] tracking-[0.12em] text-slate-500 uppercase">{cell.label}</p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900 tabular-nums">{cell.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 space-y-0.5">
                      <MetricRow label={t.costPerSearch} value={`${SEARCH_COST_TOKENS.toLocaleString("en-US")} token`} />
                      <Separator className="bg-slate-100" />
                      <MetricRow label={t.tokenRate} value={t.tokenRateValue} />
                      <Separator className="bg-slate-100" />
                      <MetricRow
                        label={t.balanceStatus}
                        value={tokens > 0 ? t.sufficient : t.needTopUp}
                        tone={tokens > 0 ? "emerald" : "amber"}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className={PANEL}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                        <Clock3 className="size-4 text-emerald-600" /> {t.recentPayouts}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setTab("affiliate")}
                        className="text-[10px] text-brand hover:underline"
                      >
                        {t.viewAll}
                      </button>
                    </div>

                    {safePayouts.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                        <p className="text-xs font-medium text-slate-700">{t.noPayouts}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          {t.commissionAfterRequest}
                        </p>
                      </div>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {safePayouts.slice(0, 4).map((payout) => (
                          <li
                            key={payout.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-700 tabular-nums">
                                {money(payout.amountMinor, payout.currency)}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {new Date(payout.requestedAt).toLocaleDateString("en-GB")}
                              </p>
                            </div>
                            <Pill tone={payout.status === "paid" ? "emerald" : "amber"} className="shrink-0">
                              {payout.status}
                            </Pill>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          {tab === "store" && (
            <section id="panel-store" role="tabpanel" aria-labelledby="tab-store" className="space-y-4">
              <header>
                <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                  {t.storeEyebrow}
                </p>
                <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.03em] text-slate-900 break-words sm:text-[26px]">
                  {t.storeTitle}
                </h1>
                <p className="mt-1 text-[13px] text-slate-500">
                  {t.storeSub}
                </p>
              </header>

              <Card className={cn(PANEL, "overflow-hidden")}>
                <CardContent className="relative p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <IconTile icon={Store} tone="brand" size="sm" />
                      <div className="min-w-0">
                        <p className="text-[10px] tracking-[0.14em] text-slate-500 uppercase">{t.shopLinkLabel}</p>
                        <p className="text-[13px] font-medium break-all text-slate-900">
                          {store.slug ? `jutaone.biz/shop/${store.slug}` : t.shopNotOpened}
                        </p>
                      </div>
                    </div>
                    {store.isOpen ? (
                      <Pill>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {t.opened}
                      </Pill>
                    ) : (
                      <Pill tone="amber">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {t.closed}
                      </Pill>
                    )}
                  </div>

                  {shopUrl ? (
                    <div className="mt-4">
                      <CopyField value={shopUrl} label={t.shopLinkLabel} onOpen={`https://${shopUrl}`} copyLabel={t.copy} copiedLabel={t.copiedShort} manualLabel={t.manualShort} openTip={t.openNewTab} openWord={t.openWord} linkWord={t.linkWord} blocked={t.clipboardBlocked} />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Pill tone="slate">
                          <Package className="size-3" /> {store.productCount} {t.activeProducts}
                        </Pill>
                        <Pill tone="slate">
                          <Clock3 className="size-3" />
                          {store.subscriptionStatus === "trial"
                            ? `${trialDays} ${t.trialLeftDays}`
                            : store.subscriptionStatus === "active"
                              ? t.trialActive
                              : t.noSubscription}
                        </Pill>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-medium text-slate-700">{t.shopNotOpenedTitle}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {t.shopNotOpenedDesc}
                      </p>
                      <Button
                        asChild
                        className="cta-glow mt-3 h-9 rounded-xl bg-brand px-3.5 text-xs font-semibold text-white hover:bg-brand-hover"
                      >
                        <Link href="/store">
                          {t.openShop} <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                <Card className={cn(PANEL, "panel-lift")}>
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between">
                      <IconTile icon={Package} tone="slate" />
                      <Pill tone="slate">{store.productCount} {t.shop.toLowerCase() === "toko" ? "produk" : "produk"}</Pill>
                    </div>
                    <h2 className="mt-4 text-[13px] font-semibold text-slate-900">{t.catalogTitle}</h2>
                    <p className="mt-1 flex-1 text-[11px] leading-relaxed text-slate-500">
                      {t.catalogDesc}
                    </p>
                    <div className="mt-3 space-y-0.5">
                      <MetricRow label={t.shopStatus} value={store.isOpen ? t.opened : t.closed} tone={store.isOpen ? "emerald" : "amber"} />
                      <Separator className="bg-slate-100" />
                      <MetricRow label={t.publicLink} value={store.slug ? t.activeValue : t.noneValue} />
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="mt-4 h-10 w-full gap-1.5 rounded-xl border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-brand/40 hover:text-slate-900"
                    >
                      <Link href="/store">
                        {t.manageProducts} <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="relative gap-0 overflow-hidden rounded-2xl border border-brand/30 bg-white py-0 shadow-sm ring-0">
                  <CardContent className="relative flex h-full flex-col p-5">
                    <div className="flex items-start justify-between">
                      <IconTile icon={Sparkles} tone="brand" />
                      <Badge
                        variant="outline"
                        className="h-auto gap-1 rounded-full border-brand/40 bg-brand/15 px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-brand-deep uppercase"
                      >
                        <BadgeCheck className="size-3" /> {t.pro}
                      </Badge>
                    </div>

                    <div className="mt-4">
                      <p className="text-[13px] font-semibold text-slate-900">{t.shopRental}</p>
                      <p className="text-[10px] text-slate-500">{t.monthlyCancel}</p>
                    </div>

                    <div className="mt-3 flex items-end gap-1.5">
                      <span className="text-[34px] leading-none font-semibold tracking-[-0.03em] text-slate-900 tabular-nums">
                        $5
                      </span>
                      <span className="pb-1 text-[11px] text-slate-500">{t.perMonth}</span>
                      <span className="ml-auto pb-1 text-[10px] text-slate-500">≈ RM23.50</span>
                    </div>

                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      {store.subscriptionStatus === null
                        ? t.notSubscribed
                        : store.subscriptionStatus === "trial"
                          ? `${trialDays} ${t.trialLeftDesc}`
                          : store.isOpen
                            ? t.subActiveDesc
                            : t.subExpiredDesc}
                    </p>

                    <ul className="mt-3 space-y-1.5 text-[11px] text-slate-700">
                      {t.rentalFeatures.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {store.subscriptionStatus === "trial" && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">{t.trialRemaining}</span>
                          <span className="font-medium text-slate-700 tabular-nums">{trialDays}/7 {t.days}</span>
                        </div>
                        <Progress
                          value={trialPercent}
                          className="mt-2 h-1.5 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-brand [&>[data-slot=progress-indicator]]:to-sky-400"
                        />
                      </div>
                    )}

                    <Button
                      asChild
                      className="cta-glow mt-4 h-10 w-full rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover"
                    >
                      <Link href="/store">{t.manageSubscription}</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}

          {tab === "affiliate" && (
            <section id="panel-affiliate" role="tabpanel" aria-labelledby="tab-affiliate" className="space-y-4">
              <header>
                <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                  {t.affiliateEyebrow}
                </p>
                <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.03em] text-slate-900 break-words sm:text-[26px]">
                  {t.shareBuild}
                </h1>
                <p className="mt-1 text-[13px] text-slate-500">
                  {t.oneLink}
                </p>
              </header>

              <ReferralHero
                referralHref={referralHref}
                referralUrl={referralUrl}
                code={affiliate.code}
                shareHref={shareHref}
                t={t}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: t.networkSize,
                    value: `${affiliate.networkSize}`,
                    hint: t.inNetwork,
                    icon: Users,
                    tone: "brand" as const,
                  },
                  {
                    label: t.directCom,
                    value: money(affiliate.directMinor, affiliate.currency),
                    hint: t.directHint,
                    icon: Share2,
                    tone: "emerald" as const,
                  },
                  {
                    label: t.passiveNet,
                    value: money(affiliate.passiveMinor, affiliate.currency),
                    hint: t.passiveHint,
                    icon: Wallet,
                    tone: "violet" as const,
                  },
                ].map((item) => (
                  <Card key={item.label} className={cn(PANEL, "panel-lift")}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <IconTile icon={item.icon} tone={item.tone} size="sm" />
                        <span className="text-[9px] tracking-[0.14em] text-slate-500 uppercase">
                          {item.label}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-2xl font-semibold text-slate-900 tabular-nums">
                        {item.value}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{item.hint}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className={cn(PANEL, "overflow-hidden")}>
                <CardContent className="relative p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-brand/10 text-amber-600 ring-1 ring-amber-400/25 ring-inset">
                        <currentRank.icon className="size-5" />
                      </span>
                      <div>
                        <p className="text-[10px] tracking-[0.14em] text-slate-500 uppercase">
                          {t.rankTitle}
                        </p>
                        <p className="text-lg leading-tight font-semibold text-slate-900">
                          {currentRank.name}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setRankOpen(true)}
                      className="h-8 gap-1 rounded-lg px-2.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      {t.howToRank} <ArrowUpRight className="size-3" />
                    </Button>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {nextRank
                          ? `${peopleToNext} ${t.moreForNext} ${nextRank.name}`
                          : t.highestReached}
                      </span>
                      <span className="font-medium text-slate-700 tabular-nums">{rankPercent}%</span>
                    </div>
                    <Progress
                      value={rankPercent}
                      className="mt-2 h-2 bg-slate-100 [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-amber-400 [&>[data-slot=progress-indicator]]:via-brand [&>[data-slot=progress-indicator]]:to-sky-400"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-5 gap-1.5">
                    {RANKS_UI.map((rank, index) => {
                      const unlocked = affiliate.networkSize >= rank.min;
                      const isCurrent = index === rankIndex;
                      const Icon = rank.icon;
                      return (
                        <div
                          key={rank.name}
                          className={cn(
                            "relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center transition-colors",
                            isCurrent
                              ? "border-amber-400/50 bg-amber-50 shadow-sm"
                              : unlocked
                                ? "border-slate-200 bg-white"
                                : "border-slate-100 bg-slate-50 opacity-50",
                          )}
                        >
                          {unlocked ? (
                            <Icon className={cn("size-4", isCurrent ? "text-amber-600" : "text-slate-600")} />
                          ) : (
                            <Lock className="size-3.5 text-slate-400" />
                          )}
                          <span
                            className={cn(
                              "text-[9px] leading-tight font-medium",
                              isCurrent ? "text-amber-800" : "text-slate-500",
                            )}
                          >
                            {rank.name}
                          </span>
                          <span className="text-[8px] text-slate-400 tabular-nums">{rank.min}+</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className={PANEL}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                      <Network className="size-4 text-brand" /> {t.networkTitle}
                    </h2>
                    <Pill tone="blue">
                      <Users className="size-3" /> {affiliate.networkSize} {t.inNetwork}
                    </Pill>
                  </div>

                  <div className="mt-4 space-y-0.5">
                    <MetricRow
                      label={t.directCom}
                      value={money(affiliate.directMinor, affiliate.currency)}
                      tone="emerald"
                    />
                    <Separator className="bg-slate-100" />
                    <MetricRow
                      label={t.passiveNet}
                      value={money(affiliate.passiveMinor, affiliate.currency)}
                    />
                    <Separator className="bg-slate-100" />
                    <MetricRow
                      label={t.networkSize}
                      value={`${affiliate.networkSize} ${t.people}`}
                    />
                  </div>

                  <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                    {t.networkNote}
                  </p>

                  {affiliate.networkSize === 0 && (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-medium text-slate-700">{t.networkEmpty}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {t.networkEmptyDesc}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
                <Card className={PANEL}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2">
                      <Wallet className="size-4 text-emerald-600" />
                      <p className="text-[10px] tracking-[0.14em] text-slate-500 uppercase">
                        {t.withdrawable}
                      </p>
                    </div>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums break-all">
                      {money(affiliate.availableMinor, affiliate.currency)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{t.minPayout}</p>

                    <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
                      <DialogTrigger asChild>
                        <Button
                          disabled={affiliate.availableMinor <= 0}
                          className="cta-glow mt-4 h-10 w-full rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover disabled:bg-brand/40 disabled:shadow-none"
                        >
                          {t.requestPayout}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-2xl border border-slate-200 bg-white sm:max-w-sm">
                        <DialogHeader>
                          <DialogTitle className="text-slate-900">{t.confirmRequest}</DialogTitle>
                          <DialogDescription className="text-xs leading-relaxed text-slate-500">
                            {t.confirmDesc}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[10px] tracking-[0.12em] text-slate-500 uppercase">{t.amount}</p>
                          <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                            {money(affiliate.availableMinor, affiliate.currency)}
                          </p>
                        </div>
                        <DialogFooter className="-mx-4 -mb-4 rounded-b-2xl border-slate-100 bg-slate-50">
                          <DialogClose asChild>
                            <Button variant="ghost" className="h-9 rounded-xl text-xs text-slate-500 hover:text-slate-900">
                              {t.cancel}
                            </Button>
                          </DialogClose>
                          <Button
                            onClick={() => {
                              setPayoutOpen(false);
                              void requestPayout();
                            }}
                            disabled={requesting}
                            className="h-9 rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover"
                          >
                            {requesting ? t.sending : t.sendRequest}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {requestNote && (
                      <p
                        role="status"
                        className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700"
                      >
                        {requestNote}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className={PANEL}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] tracking-[0.14em] text-slate-500 uppercase">
                        {t.payoutHistory}
                      </p>
                      <Pill tone="slate">{safePayouts.length}</Pill>
                    </div>
                    {safePayouts.length === 0 ? (
                      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                        {t.noPayoutYet}
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {safePayouts.slice(0, 5).map((payout) => (
                          <li
                            key={payout.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {new Date(payout.requestedAt).toLocaleDateString("en-GB")}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-slate-700 tabular-nums">
                                {money(payout.amountMinor, payout.currency)}
                              </span>
                              <Pill tone={payout.status === "paid" ? "emerald" : "amber"}>{payout.status}</Pill>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {affiliate.code && (
                <Link
                  href={`/dashboard/affiliate?ref=${affiliate.code}`}
                  className="panel-lift group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <span className="flex items-center gap-2.5 text-[13px] text-slate-700">
                    <IconTile icon={Trophy} tone="amber" size="sm" />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{t.viewFullNetwork}</span>
                      <span className="block text-[10px] text-slate-500">
                        {t.full19Desc}
                      </span>
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              )}

              <Dialog open={rankOpen} onOpenChange={setRankOpen}>
                <DialogContent className="rounded-2xl border border-slate-200 bg-white sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-slate-900">{t.howToRankTitle}</DialogTitle>
                    <DialogDescription className="text-xs leading-relaxed text-slate-500">
                      {t.howToRankDesc}
                    </DialogDescription>
                  </DialogHeader>
                  <ul className="space-y-2">
                    {RANKS_UI.map((rank) => {
                      const unlocked = affiliate.networkSize >= rank.min;
                      const Icon = rank.icon;
                      return (
                        <li
                          key={rank.name}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border p-3 text-xs",
                            unlocked
                              ? "border-slate-200 bg-white text-slate-700"
                              : "border-slate-100 bg-slate-50 text-slate-500",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              unlocked ? "bg-brand/15 text-brand" : "bg-slate-100 text-slate-400",
                            )}
                          >
                            {unlocked ? <Icon className="size-4" /> : <Lock className="size-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-slate-900">{rank.name}</span>
                            <span className="block text-[10px] text-slate-500">{rank.blurb}</span>
                          </span>
                          <span className="shrink-0 text-slate-400 tabular-nums">{rank.min}+</span>
                        </li>
                      );
                    })}
                  </ul>
                  <DialogFooter className="-mx-4 -mb-4 rounded-b-2xl border-slate-100 bg-slate-50">
                    <DialogClose asChild>
                      <Button className="h-9 rounded-xl bg-brand text-xs font-semibold text-white hover:bg-brand-hover">
                        {t.gotIt}
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </section>
          )}

          {tab === "tools" && (
            <section id="panel-tools" role="tabpanel" aria-labelledby="tab-tools" className="space-y-4">
              <header>
                <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-500 uppercase">
                  {t.toolsEyebrow}
                </p>
                <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.03em] text-slate-900 break-words sm:text-[26px]">
                  {t.appsForBiz}
                </h1>
                <p className="mt-1 text-[13px] text-slate-500">
                  {t.toolsSub}
                </p>
              </header>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    name: t.toolAdName,
                    desc: t.toolAdDesc,
                    href: `/${lang}#demo`,
                    icon: Sparkles,
                    tone: "brand" as const,
                    tag: t.toolAdTag,
                    art: "/assets/ai-robot.jpg" as string | null,
                    glow: "group-hover:border-brand/45 group-hover:shadow-[0_26px_60px_-38px_rgba(59,130,246,0.9)]",
                    wash: "from-brand/20",
                  },
                  {
                    name: t.toolBizName,
                    desc: t.toolBizDesc,
                    href: "/directory",
                    icon: Bot,
                    tone: "emerald" as const,
                    tag: t.toolBizTag,
                    art: "/assets/biz-match.jpg" as string | null,
                    glow: "group-hover:border-emerald-500/45 group-hover:shadow-[0_26px_60px_-38px_rgba(16,185,129,0.9)]",
                    wash: "from-emerald-500/20",
                  },
                  {
                    name: t.toolShopName,
                    desc: t.toolShopDesc,
                    href: "/store",
                    icon: Store,
                    tone: "amber" as const,
                    tag: t.toolShopTag,
                    art: "/assets/gold.jpg" as string | null,
                    glow: "group-hover:border-amber-400/45 group-hover:shadow-[0_26px_60px_-38px_rgba(251,191,36,0.75)]",
                    wash: "from-amber-400/20",
                  },
                  {
                    name: t.toolNetName,
                    desc: t.toolNetDesc,
                    href: affiliate.code ? `/dashboard/affiliate?ref=${affiliate.code}` : "/dashboard",
                    icon: Network,
                    tone: "violet" as const,
                    tag: t.toolNetTag,
                    art: "/assets/token.jpg" as string | null,
                    glow: "group-hover:border-violet-500/45 group-hover:shadow-[0_26px_60px_-38px_rgba(139,92,246,0.85)]",
                    wash: "from-violet-500/20",
                  },
                ].map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.name}
                      href={tool.href}
                      className={cn(
                        "panel-lift group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
                        tool.glow,
                      )}
                    >
                      <div className="relative flex items-start justify-between">
                        {tool.art ? (
                          <PremiumArt
                            src={tool.art}
                            alt=""
                            size={56}
                            glow={tool.tone === "brand" ? "cyan" : tool.tone === "emerald" ? "silver" : tool.tone === "amber" ? "gold" : "violet"}
                            rounded="rounded-2xl"
                          />
                        ) : (
                        <span
                          className={cn(
                            "flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105",
                            tool.tone === "brand" && "bg-brand/15 text-brand ring-brand/25",
                            tool.tone === "emerald" && "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25",
                            tool.tone === "amber" && "bg-amber-400/15 text-amber-700 ring-amber-400/25",
                            tool.tone === "violet" && "bg-violet-500/15 text-violet-700 ring-violet-500/25",
                          )}
                        >
                          <Icon className="size-6" />
                        </span>
                        )}
                        <span className="flex items-center gap-2">
                          <Pill tone="slate">{tool.tag}</Pill>
                          <ArrowUpRight className="size-4 text-slate-400 transition-colors group-hover:text-brand" />
                        </span>
                      </div>
                      <p className="relative mt-4 text-[13px] font-semibold text-slate-900">{tool.name}</p>
                      <p className="relative mt-1 text-[11px] leading-relaxed break-words text-slate-500">{tool.desc}</p>
                      <p className="relative mt-3 flex items-center gap-1 text-[10px] font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                        {t.openAction} <ArrowRight className="size-3" />
                      </p>
                    </Link>
                  );
                })}
              </div>

              <Card className={cn(PANEL, "border-dashed")}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconTile icon={Gift} tone="slate" size="sm" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-900">{t.needHelp}</p>
                      <p className="text-[11px] text-slate-500">{t.teamHelp}</p>
                    </div>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-brand/40 hover:text-slate-900"
                  >
                    <a href="https://wa.me/60123456789" target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-3.5" /> {t.contactUs}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </section>
          )}
        </main>

        <nav
          aria-label={t.mainNav}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto flex max-w-md items-stretch justify-around gap-1 px-2 pt-1.5 pb-1.5">
            {TABS_UI.map((entry) => {
              const Icon = entry.icon;
              const active = tab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] leading-tight font-medium break-words transition-colors",
                    active ? "text-brand" : "text-muted",
                  )}
                >
                  {entry.art ? (
                    <PremiumArt src={entry.art} alt="" size={32} glow="cyan" rounded="rounded-lg" />
                  ) : (
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-brand/15" : "",
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  )}
                  {entry.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </TooltipProvider>
  );
}

function ReferralHero({
  referralHref,
  referralUrl,
  code,
  shareHref,
  t,
}: {
  referralHref: string | null;
  referralUrl: string | null;
  code: string | null;
  shareHref: string | null;
  t: DashDict;
}) {
  const { state, copy } = useClipboard(referralHref ?? "");

  return (
    <Card className="relative gap-0 overflow-hidden rounded-2xl border border-brand/25 bg-white py-0 shadow-sm ring-0">
      <CardContent className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand ring-1 ring-brand/25 ring-inset">
              <Rocket className="size-3.5" />
            </span>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-brand uppercase">
              {t.referralTitle}
            </p>
          </div>
          {code && (
            <span className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] break-all text-slate-600 uppercase">
              {code}
            </span>
          )}
        </div>

        {referralUrl ? (
          <>
            <p className="mt-3.5 font-mono text-xl leading-snug font-medium break-all text-slate-900 sm:text-[28px]">
              {referralUrl}
            </p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {t.referralSub}
            </p>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <Button
                type="button"
                onClick={copy}
                className="cta-glow h-14 flex-1 gap-2.5 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-hover"
              >
                {state === "copied" ? <Check className="size-5" /> : <Copy className="size-5" />}
                {state === "copied" ? t.copiedBtn : state === "failed" ? t.manualCopyBtn : t.copyLink}
              </Button>
              {shareHref && (
                <Button
                  asChild
                  className="cta-glow-emerald h-14 flex-1 gap-2.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  <a href={shareHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-5" /> {t.shareWhatsapp}
                  </a>
                </Button>
              )}
            </div>

            {state === "failed" && (
              <p role="alert" className="mt-2 text-[11px] text-amber-700">
                {t.clipboardBlocked}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <Percent className="size-3 text-emerald-600" /> {t.rateNoteA}
              </span>
              <span className="flex items-center gap-1.5">
                <LayersIcon /> {t.rateNoteB}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="size-3 text-brand" /> {t.instantCredit}
              </span>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{t.noAffiliateCode}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LayersIcon() {
  return <Network className="size-3 text-brand-deep" />;
}
