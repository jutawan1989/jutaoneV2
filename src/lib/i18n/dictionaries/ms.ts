import { COMPLIANCE_DISCLAIMER_MS } from "@/lib/compliance";
import type { Dictionary } from "./en";

export const ms: Dictionary = {
  meta: {
    title: "JutaOne.Biz — Kapsyen iklan AI untuk peniaga kecil",
    description:
      "Tukar satu ayat tentang produk anda kepada kapsyen TikTok atau Facebook dalam Bahasa Melayu, Indonesia atau Inggeris — dalam beberapa saat. Bayar guna token, tanpa langganan.",
  },
  nav: {
    demo: "Demo langsung",
    gold: "Widget emas",
    pricing: "Harga token",
    cta: "Mula dengan {price}",
    languageLabel: "Bahasa",
  },
  hero: {
    eyebrow: "Enjin iklan AI untuk peniaga kecil",
    title: "Papan iklan bergerak",
    titleAccent: "untuk perniagaan anda",
    subtitle:
      "Taip apa yang anda jual. Dapatkan kapsyen TikTok atau Facebook yang menarik perhatian dalam masa kurang 3 saat — tanpa agensi, tanpa penulis iklan, tanpa akaun.",
    ctaPrimary: "Cuba demo percuma",
    ctaSecondary: "Lihat harga token",
    stats: [
      { value: "3 saat", label: "Masa purata jana kapsyen" },
      { value: "3 bahasa", label: "Melayu, Indonesia, Inggeris" },
      { value: "Tanpa daftar", label: "Demo boleh guna tanpa akaun" },
    ],
  },
  billboard: {
    label: "Contoh langsung",
    cards: [
      "Nasi lemak sambal petai — masih panas pukul 7 pagi.",
      "Biskut mentega bakar sendiri. Sebalang habis dalam sekelip mata.",
      "Kopi susu gula aren, angkat pagi, senyum sampai tengah hari.",
      "Baiki telefon sementara anda tunggu. Skrin siap dalam 20 minit.",
      "Kek lapis Sarawak — tempah hari ini, ambil esok.",
    ],
  },
  generator: {
    title: "Cuba sekarang",
    subtitle:
      "Dua kapsyen percuma untuk setiap pelawat. Tiada e-mel, tiada nombor telefon, tiada akaun — tiada apa perlu diisi.",
    label: "Taip apa yang anda jual",
    placeholder: "Contoh: Biskut mentega bakar sendiri, RM25 sebalang, penghantaran sekitar Lembah Klang.",
    hint: "Maksimum 200 aksara. Sertakan harga dan kawasan anda untuk kapsyen yang lebih tepat.",
    submit: "Tulis kapsyen saya",
    generating: "Sedang menulis...",
    remaining: "{count} percubaan percuma tinggal",
    remainingPlural: "{count} percubaan percuma tinggal",
    limitBadge: "Percubaan percuma digunakan: {count}/{max}",
    outputLabel: "Kapsyen anda",
    copy: "Salin",
    copied: "Disalin",
    regenerateHint: "Belum sesuai? Ubah teks anda dan cuba lagi selagi percubaan masih ada.",
    errorGeneric: "Maaf, ada masalah. Sila cuba sebentar lagi.",
    errorLimit: "Percubaan percuma anda sudah habis. Tambah nilai untuk teruskan.",
    errorBlocked: "Demo dijeda untuk hari ini. Anda masih boleh tambah nilai.",
    errorTooShort: "Sila tulis sekurang-kurangnya 5 aksara.",
  },
  gold: {
    title: "Widget isyarat emas & perak",
    subtitle:
      "Pratonton bersaiz telefon untuk widget yang boleh anda letakkan pada laman perniagaan anda. Beranimasi dan mudah dibaca sepintas lalu.",
    screenTitle: "Isyarat pasaran",
    priceRow: "Isyarat · tetingkap 24 jam",
    disclaimer: COMPLIANCE_DISCLAIMER_MS,
    note: "Semua angka dan isyarat di sini adalah simulasi. Ia tidak menggambarkan data pasaran sebenar atau prestasi sebenar.",
    signals: {
      buy: "BELI",
      sell: "JUAL",
      hold: "TAHAN",
    },
    instruments: {
      gold: "Emas 999",
      silver: "Perak 925",
    },
  },
  pricing: {
    title: "Token sahaja. Tiada yang tersembunyi.",
    subtitle: "Satu tambah nilai, satu baki. Tiada yuran bulanan, tiada kontrak.",
    tokenName: "1 Juta Token",
    priceLabel: "Jumlah",
    cta: "Tambah nilai dengan FPX atau kad",
    bullets: [
      "Tiga bahasa: Melayu, Indonesia, Inggeris",
      "Kapsyen untuk TikTok dan Facebook",
      "Tiada langganan, tiada pembaharuan automatik",
      "Bayar hanya apabila anda bersedia",
    ],
    topupNote: "Pembayaran dikendalikan oleh Chip.Asia. Anda bayar dalam {currency}.",
  },
  hook: {
    close: "Nanti dulu",
    dismissLabel: "Tutup",
    variantA: {
      label: "Dapatkan token anda",
      title: "Hebat kan?",
      body: "Mula automasi perniagaan anda hari ini dengan hanya {price}. Itu {tokenName} dalam akaun anda, sedia untuk digunakan.",
      cta: "Tambah nilai {price} sekarang",
      note: "Tiada langganan. Tiada kontrak. Harga kekal dalam {currency}.",
    },
    variantB: {
      label: "Berhenti mula dari kosong",
      title: "Jangan mula dari kapsyen kosong lagi",
      body: "Setiap produk yang anda jual dapat kapsyen sedia terbit — dalam tiga bahasa, dalam beberapa saat. Satu tambah nilai {price} sudah cukup untuk teruskan.",
      cta: "Dapatkan {tokenName} saya",
      note: "Tiada langganan. Tiada kontrak. Harga kekal dalam {currency}.",
    },
  },
  topup: {
    title: "Tambah nilai baki anda",
    subtitle: "Mod sandbox — tiada bayaran sebenar akan dikenakan.",
    amount: "Jumlah",
    tokens: "Token",
    status: "Status",
    statusPending: "Menunggu pengesahan penyedia",
    statusMock: "Penyedia pembayaran belum dikonfigurasi",
    back: "Kembali ke demo",
    finish: "Simulasikan pembayaran berjaya",
    finished: "Pembayaran sandbox direkodkan. Terima kasih — baki anda kini {tokenName}.",
  },
  compliance: {
    disclaimer:
      "JutaOne.Biz membantu peniaga kecil menulis iklan yang lebih baik. Kami bukan penasihat kewangan atau pelaburan. Widget emas dan perak ialah simulasi untuk tujuan demonstrasi sahaja.",
    noGuarantee: "Kami tidak menjanjikan keuntungan, pendapatan atau pulangan kewangan.",
  },
  footer: {
    tagline: "Teks iklan AI untuk peniaga kecil di Malaysia dan Indonesia.",
    rights: "© {year} JutaOne.Biz. Hak cipta terpelihara.",
    links: {
      privacy: "Privasi",
      terms: "Terma",
    },
  },
  a11y: {
    skipToContent: "Lompat ke kandungan",
    globeLabel: "Glob berputar",
  },
};
