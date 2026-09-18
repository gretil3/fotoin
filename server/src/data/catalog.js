/**
 * FOTOIN product catalog.
 *
 * Three things live here, and they are the heart of the product:
 *   1. CATEGORIES   - the four UMKM verticals we serve, each with prompt-less
 *                     style presets (the seller picks a look, never writes a prompt).
 *   2. MARKETPLACES - exact output specs for Shopee, Tokopedia, TikTok Shop.
 *   3. PACKS        - non-subscription pricing, Rp15.000-Rp25.000 per pack.
 */

/** @typedef {'kuliner'|'fashion-muslim'|'kerajinan'|'kosmetik'} CategoryId */

export const CATEGORIES = [
  {
    id: 'kuliner',
    name: 'Kuliner',
    nameEn: 'Food & Beverage',
    icon: 'kuliner',
    description: 'Makanan rumahan, frozen food, minuman, snack kemasan.',
    tips: 'Foto dari sudut 45 derajat dengan cahaya jendela. Pastikan makanan terlihat utuh.',
    styles: [
      {
        id: 'studio-putih',
        name: 'Studio Putih Bersih',
        description: 'Latar putih polos, bayangan lembut. Wajib untuk foto utama marketplace.',
        background: { type: 'solid', colors: ['#ffffff'] },
        default: true,
      },
      {
        id: 'meja-kayu',
        name: 'Meja Kayu Hangat',
        description: 'Alas kayu dengan pencahayaan hangat, cocok untuk masakan rumahan.',
        background: { type: 'gradient', colors: ['#d9a86c', '#8a5a2b'] },
      },
      {
        id: 'flatlay-bahan',
        name: 'Flat-lay dengan Bahan',
        description: 'Tampak atas, dikelilingi bahan segar. Bagus untuk konten media sosial.',
        background: { type: 'gradient', colors: ['#f4efe6', '#ddd0bb'] },
      },
      {
        id: 'lifestyle-kafe',
        name: 'Lifestyle Kafe',
        description: 'Suasana meja kafe, kesan produk siap santap.',
        background: { type: 'gradient', colors: ['#3f3630', '#6d5c50'] },
      },
      {
        id: 'promo-kontras',
        name: 'Promo Warna Kontras',
        description: 'Latar warna berani untuk banner diskon dan iklan.',
        background: { type: 'gradient', colors: ['#ff7a18', '#af002d'] },
      },
    ],
  },
  {
    id: 'fashion-muslim',
    name: 'Fashion & Hijab',
    nameEn: 'Muslim Fashion',
    icon: 'fashion',
    description: 'Hijab, gamis, koko, mukena, dan busana muslim lainnya.',
    tips: 'Gantung atau setrika produk dulu. Hindari lipatan agar hasil AI lebih rapi.',
    styles: [
      {
        id: 'studio-putih',
        name: 'Studio Putih Bersih',
        description: 'Latar putih polos, fokus penuh ke detail kain.',
        background: { type: 'solid', colors: ['#ffffff'] },
        default: true,
      },
      {
        id: 'beige-minimalis',
        name: 'Beige Minimalis',
        description: 'Nuansa nude lembut, kesan brand modest premium.',
        background: { type: 'gradient', colors: ['#efe3d6', '#cbb49c'] },
      },
      {
        id: 'flatlay-kain',
        name: 'Flat-lay Kain',
        description: 'Tampak atas dengan lipatan rapi, menonjolkan tekstur dan warna.',
        background: { type: 'gradient', colors: ['#f7f4f0', '#e2dcd4'] },
      },
      {
        id: 'lifestyle-interior',
        name: 'Lifestyle Interior',
        description: 'Latar ruangan terang bergaya Skandinavia.',
        background: { type: 'gradient', colors: ['#e8eef1', '#b9c7cf'] },
      },
      {
        id: 'ramadan-elegan',
        name: 'Ramadan Elegan',
        description: 'Nuansa hijau-emas untuk kampanye musiman.',
        background: { type: 'gradient', colors: ['#0f3d2e', '#1f7a5c'] },
      },
    ],
  },
  {
    id: 'kerajinan',
    name: 'Kerajinan & Dekorasi',
    nameEn: 'Handicraft & Home Decor',
    icon: 'kerajinan',
    description: 'Anyaman, keramik, ukiran kayu, lilin, dan dekorasi rumah handmade.',
    tips: 'Bersihkan debu pada produk dan ambil foto dari dua sudut berbeda.',
    styles: [
      {
        id: 'studio-putih',
        name: 'Studio Putih Bersih',
        description: 'Latar putih polos, siap unggah sebagai foto utama.',
        background: { type: 'solid', colors: ['#ffffff'] },
        default: true,
      },
      {
        id: 'natural-linen',
        name: 'Natural Linen',
        description: 'Alas kain linen netral, menonjolkan kesan handmade.',
        background: { type: 'gradient', colors: ['#f0e9dd', '#cdbfa8'] },
      },
      {
        id: 'rak-interior',
        name: 'Rak Interior',
        description: 'Ditempatkan di rak kayu, membantu pembeli membayangkan skala.',
        background: { type: 'gradient', colors: ['#cfa87e', '#7c5233'] },
      },
      {
        id: 'monokrom-gelap',
        name: 'Monokrom Gelap',
        description: 'Latar gelap dramatis untuk produk premium.',
        background: { type: 'gradient', colors: ['#242424', '#4a4a4a'] },
      },
      {
        id: 'taman-outdoor',
        name: 'Taman Outdoor',
        description: 'Suasana luar ruang bernuansa hijau alami.',
        background: { type: 'gradient', colors: ['#2f5d3a', '#84a95c'] },
      },
    ],
  },
  {
    id: 'kosmetik',
    name: 'Skincare & Kosmetik',
    nameEn: 'Local Beauty',
    icon: 'kosmetik',
    description: 'Skincare lokal, body care, parfum, dan kosmetik brand sendiri.',
    tips: 'Lap botol agar bebas sidik jari. Pastikan label produk menghadap kamera.',
    styles: [
      {
        id: 'studio-putih',
        name: 'Studio Putih Bersih',
        description: 'Latar putih polos dengan pantulan halus.',
        background: { type: 'solid', colors: ['#ffffff'] },
        default: true,
      },
      {
        id: 'podium-batu',
        name: 'Podium Batu',
        description: 'Produk di atas podium, kesan clinical dan premium.',
        background: { type: 'gradient', colors: ['#eae6e1', '#c2b8ad'] },
      },
      {
        id: 'pastel-lembut',
        name: 'Pastel Lembut',
        description: 'Gradasi pastel yang ramah untuk feed Instagram.',
        background: { type: 'gradient', colors: ['#ffe3ec', '#c9e4ff'] },
      },
      {
        id: 'air-segar',
        name: 'Air & Kesegaran',
        description: 'Nuansa biru jernih untuk klaim hydrating.',
        background: { type: 'gradient', colors: ['#d8f3ff', '#2f8fbf'] },
      },
      {
        id: 'glow-gelap',
        name: 'Glow Gelap',
        description: 'Latar gelap dengan cahaya lembut untuk serum dan parfum.',
        background: { type: 'gradient', colors: ['#1a1526', '#4b3a6b'] },
      },
    ],
  },
];

/**
 * Output specs per marketplace. Sizes follow each platform's recommended
 * product-image dimensions. Every output is `contain`-fitted so the whole
 * product stays visible and the style background fills the padding instead of
 * the crop eating into the product.
 */
export const MARKETPLACES = [
  {
    id: 'shopee',
    name: 'Shopee',
    color: '#ee4d2d',
    outputs: [
      { label: 'Foto Utama 1:1', width: 1000, height: 1000 },
      { label: 'Cover Promosi 1:1', width: 1200, height: 1200 },
    ],
    notes: 'Rasio 1:1, maksimal 2 MB per gambar, hingga 9 foto per produk.',
  },
  {
    id: 'tokopedia',
    name: 'Tokopedia',
    color: '#42b549',
    outputs: [
      { label: 'Foto Produk 1:1', width: 1200, height: 1200 },
      { label: 'Thumbnail 1:1', width: 700, height: 700 },
    ],
    notes: 'Rasio 1:1, minimal 700x700 px, maksimal 10 MB per gambar.',
  },
  {
    id: 'tiktok-shop',
    name: 'TikTok Shop',
    color: '#111111',
    outputs: [
      { label: 'Katalog 1:1', width: 1000, height: 1000 },
      { label: 'Vertikal 3:4', width: 1080, height: 1440 },
    ],
    notes: 'Rasio 1:1 untuk katalog dan 3:4 untuk konten showcase.',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#c13584',
    outputs: [
      { label: 'Feed 1:1', width: 1080, height: 1080 },
      { label: 'Story 9:16', width: 1080, height: 1920 },
    ],
    notes: 'Kanal bonus: feed 1:1 dan story 9:16 untuk promosi organik.',
  },
];

/**
 * Pricing. Deliberately pay-per-pack (no subscription) and priced inside the
 * Rp15.000-Rp25.000 band an UMKM seller will pay without a second thought.
 */
export const PACKS = [
  {
    id: 'hemat',
    name: 'Paket Hemat',
    priceIdr: 15000,
    photoCount: 5,
    maxStyles: 1,
    maxMarketplaces: 1,
    turnaroundHours: 6,
    freeRevisions: 0,
    priorityReview: false,
    highlights: [
      '5 foto siap unggah',
      '1 gaya latar pilihan',
      '1 marketplace tujuan',
      'Dicek reviewer manusia',
    ],
  },
  {
    id: 'standar',
    name: 'Paket Standar',
    priceIdr: 20000,
    photoCount: 10,
    maxStyles: 3,
    maxMarketplaces: 3,
    turnaroundHours: 3,
    freeRevisions: 1,
    priorityReview: false,
    popular: true,
    highlights: [
      '10 foto siap unggah',
      '3 gaya latar pilihan',
      '3 marketplace tujuan',
      'Dicek reviewer manusia',
      '1x revisi gratis',
    ],
  },
  {
    id: 'premium',
    name: 'Paket Premium',
    priceIdr: 25000,
    photoCount: 15,
    maxStyles: 5,
    maxMarketplaces: 4,
    turnaroundHours: 1,
    freeRevisions: 2,
    priorityReview: true,
    highlights: [
      '15 foto siap unggah',
      '5 gaya latar pilihan',
      'Semua marketplace + Instagram',
      'Antrean review prioritas',
      '2x revisi gratis',
    ],
  },
];

export const PAYMENT_METHODS = [
  { id: 'qris', name: 'QRIS', description: 'Scan dari bank atau e-wallet apa pun.' },
  { id: 'gopay', name: 'GoPay', description: 'Bayar langsung dari saldo GoPay.' },
  { id: 'ovo', name: 'OVO', description: 'Bayar langsung dari saldo OVO.' },
  { id: 'dana', name: 'DANA', description: 'Bayar langsung dari saldo DANA.' },
];

export const getCategory = (id) => CATEGORIES.find((category) => category.id === id) || null;

export const getStyle = (categoryId, styleId) => {
  const category = getCategory(categoryId);
  if (!category) return null;
  return category.styles.find((style) => style.id === styleId) || null;
};

export const getMarketplace = (id) => MARKETPLACES.find((market) => market.id === id) || null;

export const getPack = (id) => PACKS.find((pack) => pack.id === id) || null;

export default { CATEGORIES, MARKETPLACES, PACKS, PAYMENT_METHODS };
