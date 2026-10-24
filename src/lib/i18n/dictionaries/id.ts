import { COMPLIANCE_DISCLAIMER_ID } from "@/lib/compliance";
import type { Dictionary } from "./en";

export const id: Dictionary = {
  meta: {
    title: "JutaOne.Biz — Caption iklan AI untuk pedagang kecil",
    description:
      "Ubah satu kalimat tentang produk Anda menjadi caption TikTok atau Facebook dalam Bahasa Indonesia, Melayu, atau Inggris — dalam hitungan detik. Bayar dengan token, tanpa langganan.",
  },
  nav: {
    demo: "Demo langsung",
    gold: "Widget emas",
    pricing: "Harga token",
    cta: "Mulai dengan {price}",
    languageLabel: "Bahasa",
  },
  hero: {
    eyebrow: "Mesin iklan AI untuk pedagang kecil",
    title: "Papan iklan bergerak",
    titleAccent: "untuk bisnis Anda",
    subtitle:
      "Ketik apa yang Anda jual. Dapatkan caption TikTok atau Facebook yang bikin orang berhenti scroll dalam waktu kurang dari 3 detik — tanpa agensi, tanpa copywriter, tanpa akun.",
    ctaPrimary: "Coba demo gratis",
    ctaSecondary: "Lihat harga token",
    stats: [
      { value: "3 detik", label: "Rata-rata waktu pembuatan" },
      { value: "3 bahasa", label: "Indonesia, Melayu, Inggris" },
      { value: "Tanpa daftar", label: "Demo bisa dipakai tanpa akun" },
    ],
  },
  billboard: {
    label: "Contoh langsung",
    cards: [
      "Nasi lemak sambal petai — masih hangat jam 7 pagi.",
      "Kue kering mentega buatan sendiri. Satu toples habis dalam sekejap.",
      "Kopi susu gula aren, ambil pagi, senyum sampai siang.",
      "Servis HP sambil Anda menunggu. Layar selesai dalam 20 menit.",
      "Kue lapis Sarawak — pesan hari ini, ambil besok.",
    ],
  },
  generator: {
    title: "Coba sekarang",
    subtitle:
      "Dua caption gratis untuk setiap pengunjung. Tanpa email, tanpa nomor telepon, tanpa akun — tidak ada yang perlu diisi.",
    label: "Ketik apa yang Anda jual",
    placeholder: "Contoh: Kopi susu gula aren, Rp15.000 per cup, COD area Bandung.",
    hint: "Maksimal 200 karakter. Sertakan harga dan area Anda agar caption lebih tajam.",
    submit: "Tulis caption saya",
    generating: "Sedang menulis...",
    remaining: "{count} percobaan gratis tersisa",
    remainingPlural: "{count} percobaan gratis tersisa",
    limitBadge: "Percobaan gratis terpakai: {count}/{max}",
    outputLabel: "Caption Anda",
    copy: "Salin",
    copied: "Tersalin",
    regenerateHint: "Belum cocok? Ubah teks Anda dan coba lagi selama percobaan masih ada.",
    errorGeneric: "Maaf, ada masalah. Silakan coba lagi sebentar.",
    errorLimit: "Percobaan gratis Anda sudah habis. Top up untuk melanjutkan.",
    errorBlocked: "Demo dijeda untuk hari ini. Anda masih bisa top up.",
    errorTooShort: "Silakan tulis minimal 5 karakter.",
  },
  gold: {
    title: "Widget sinyal emas & perak",
    subtitle:
      "Pratinjau seukuran ponsel untuk widget yang bisa Anda pasang di halaman bisnis Anda. Beranimasi dan mudah dibaca sekali lihat.",
    screenTitle: "Sinyal pasar",
    priceRow: "Sinyal · jendela 24 jam",
    disclaimer: COMPLIANCE_DISCLAIMER_ID,
    note: "Semua angka dan sinyal di sini adalah simulasi. Tidak menggambarkan data pasar sebenarnya maupun kinerja sebenarnya.",
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
    title: "Hanya token. Tidak ada yang tersembunyi.",
    subtitle: "Satu top up, satu saldo. Tanpa biaya bulanan, tanpa kontrak.",
    tokenName: "1 Juta Token",
    priceLabel: "Total",
    cta: "Top up dengan FPX atau kartu",
    bullets: [
      "Tiga bahasa: Indonesia, Melayu, Inggris",
      "Caption untuk TikTok dan Facebook",
      "Tanpa langganan, tanpa perpanjangan otomatis",
      "Bayar hanya saat Anda siap",
    ],
    topupNote: "Pembayaran ditangani oleh Chip.Asia. Anda membayar dalam {currency}.",
  },
  hook: {
    close: "Nanti dulu",
    dismissLabel: "Tutup",
    variantA: {
      label: "Ambil token Anda",
      title: "Keren, kan?",
      body: "Mulai otomatisasi bisnis Anda hari ini dengan hanya {price}. Itu {tokenName} di akun Anda, siap dipakai.",
      cta: "Top up {price} sekarang",
      note: "Tanpa langganan. Tanpa kontrak. Harga tetap dalam {currency}.",
    },
    variantB: {
      label: "Berhenti mulai dari kosong",
      title: "Jangan mulai dari caption kosong lagi",
      body: "Setiap produk yang Anda jual dapat caption siap terbit — dalam tiga bahasa, dalam hitungan detik. Satu top up {price} cukup untuk melanjutkan.",
      cta: "Ambil {tokenName} saya",
      note: "Tanpa langganan. Tanpa kontrak. Harga tetap dalam {currency}.",
    },
  },
  topup: {
    title: "Top up saldo Anda",
    subtitle: "Mode sandbox — tidak ada pembayaran sebenarnya.",
    amount: "Jumlah",
    tokens: "Token",
    status: "Status",
    statusPending: "Menunggu konfirmasi penyedia",
    statusMock: "Penyedia pembayaran belum dikonfigurasi",
    back: "Kembali ke demo",
    finish: "Simulasikan pembayaran berhasil",
    finished: "Pembayaran sandbox dicatat. Terima kasih — saldo Anda kini {tokenName}.",
  },
  compliance: {
    disclaimer:
      "JutaOne.Biz membantu pedagang kecil menulis iklan yang lebih baik. Kami bukan penasihat keuangan atau investasi. Widget emas dan perak adalah simulasi untuk tujuan demonstrasi.",
    noGuarantee: "Kami tidak menjanjikan keuntungan, pendapatan, atau imbal hasil keuangan.",
  },
  footer: {
    tagline: "Teks iklan AI untuk pedagang kecil di Indonesia dan Malaysia.",
    rights: "© {year} JutaOne.Biz. Hak cipta dilindungi.",
    links: {
      privacy: "Privasi",
      terms: "Ketentuan",
    },
  },
  a11y: {
    skipToContent: "Lompat ke konten",
    globeLabel: "Globe berputar",
  },
};
