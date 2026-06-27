/**
 * Canonical card-product reference list. Single source of truth that seeds the
 * `CardProduct` table on boot (CardProductsService.onModuleInit); the app fetches
 * it via GET /card-products and offers it as a typeable dropdown in the Add Card
 * form (selecting one prefills issuer + network). Ids are derived from
 * issuer+name so the list stays easy to edit.
 */
import { BANK_SEED } from '../banks/banks.data';

export interface CardProductSeed {
  id: string;
  name: string;
  issuer: string;
  bankCode?: string; // resolved Bank.code for the issuer (undefined if none)
  network: string; // Visa | Mastercard | RuPay | Amex | Diners Club
  type: string; // Cashback | Travel | Premium | …
}

type Raw = Omit<CardProductSeed, 'id' | 'bankCode'>;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Resolve an issuer label to a Bank.code (exact name, then fuzzy). Labels that
// aren't bank names get an explicit hint; fintechs with no single issuing bank
// (e.g. "OneCard") stay unresolved. Mirrors the client's bankForIssuer.
const normalizeBank = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bbank\b/g, '')
    .replace(/[^a-z]/g, '');

const ISSUER_BANK_CODE: Record<string, string> = {
  'SBI Card': 'SBIN', // SBI Cards & Payment Services → State Bank of India
};

function bankCodeForIssuer(issuer: string): string | undefined {
  if (ISSUER_BANK_CODE[issuer]) return ISSUER_BANK_CODE[issuer];
  const n = issuer.trim();
  if (!n) return undefined;
  const exact = BANK_SEED.find((b) => b.name.toLowerCase() === n.toLowerCase());
  if (exact) return exact.code;
  const na = normalizeBank(n);
  if (!na) return undefined;
  return BANK_SEED.find((b) => {
    const nb = normalizeBank(b.name);
    return !!nb && (na.includes(nb) || nb.includes(na));
  })?.code;
}

const RAW: Raw[] = [
  {
    name: 'Millennia Credit Card',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Cashback',
  },
  {
    name: 'Regalia Gold Credit Card',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Regalia Credit Card',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Infinia Metal Edition',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Diners Club Black',
    issuer: 'HDFC Bank',
    network: 'Diners Club',
    type: 'Premium',
  },
  {
    name: 'Diners Club Privilege',
    issuer: 'HDFC Bank',
    network: 'Diners Club',
    type: 'Lifestyle',
  },
  { name: 'MoneyBack+', issuer: 'HDFC Bank', network: 'Visa', type: 'Rewards' },
  {
    name: 'Swiggy HDFC Credit Card',
    issuer: 'HDFC Bank',
    network: 'Mastercard',
    type: 'Cashback',
  },
  {
    name: 'Tata Neu Plus',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Co-branded',
  },
  {
    name: 'Tata Neu Infinity',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Co-branded',
  },
  {
    name: 'Marriott Bonvoy HDFC',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'IndianOil HDFC Credit Card',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Fuel',
  },
  {
    name: 'Paytm HDFC Credit Card',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Co-branded',
  },
  {
    name: 'Paytm HDFC Select',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Co-branded',
  },
  {
    name: 'IRCTC HDFC Credit Card',
    issuer: 'HDFC Bank',
    network: 'RuPay',
    type: 'Travel',
  },
  {
    name: 'IndiGo 6E Rewards XL',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'IndiGo 6E Rewards',
    issuer: 'HDFC Bank',
    network: 'Visa',
    type: 'Travel',
  },

  {
    name: 'SimplyCLICK',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Shopping',
  },
  { name: 'SimplySAVE', issuer: 'SBI Card', network: 'Visa', type: 'Rewards' },
  {
    name: 'Cashback SBI Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Cashback',
  },
  {
    name: 'Elite Credit Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Prime Credit Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Lifestyle',
  },
  {
    name: 'Pulse Credit Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Health',
  },
  { name: 'BPCL SBI Card', issuer: 'SBI Card', network: 'Visa', type: 'Fuel' },
  {
    name: 'BPCL SBI Octane',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Fuel',
  },
  {
    name: 'IRCTC SBI Premier',
    issuer: 'SBI Card',
    network: 'RuPay',
    type: 'Travel',
  },
  {
    name: 'Air India SBI Signature',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Air India SBI Platinum',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Reliance SBI Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Shopping',
  },
  {
    name: 'Reliance SBI Prime',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Shopping',
  },
  {
    name: 'Apollo SBI Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Healthcare',
  },
  {
    name: 'FabIndia SBI Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Shopping',
  },
  {
    name: 'Titan SBI Card',
    issuer: 'SBI Card',
    network: 'Visa',
    type: 'Lifestyle',
  },

  {
    name: 'Amazon Pay ICICI Credit Card',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Cashback',
  },
  {
    name: 'Coral Credit Card',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Lifestyle',
  },
  {
    name: 'Rubyx Credit Card',
    issuer: 'ICICI Bank',
    network: 'Mastercard',
    type: 'Premium',
  },
  {
    name: 'Sapphiro Credit Card',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Emeralde Credit Card',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'HPCL Super Saver',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Fuel',
  },
  {
    name: 'MakeMyTrip Signature',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Emirates Skywards Sapphiro',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Emirates Skywards Emeralde',
    issuer: 'ICICI Bank',
    network: 'Visa',
    type: 'Travel',
  },

  {
    name: 'ACE Credit Card',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Cashback',
  },
  {
    name: 'Atlas Credit Card',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Magnus Credit Card',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Magnus Burgundy',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Flipkart Axis Bank',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Cashback',
  },
  {
    name: 'Airtel Axis Bank',
    issuer: 'Axis Bank',
    network: 'Mastercard',
    type: 'Cashback',
  },
  {
    name: 'IndianOil Axis Bank',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Fuel',
  },
  {
    name: 'Neo Credit Card',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Rewards',
  },
  {
    name: 'My Zone Credit Card',
    issuer: 'Axis Bank',
    network: 'Mastercard',
    type: 'Lifestyle',
  },
  {
    name: 'Samsung Axis Signature',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Co-branded',
  },
  {
    name: 'Samsung Axis Infinite',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'LIC Signature',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Insurance',
  },
  {
    name: 'LIC Platinum',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Insurance',
  },
  {
    name: 'Vistara Infinite',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Vistara Signature',
    issuer: 'Axis Bank',
    network: 'Visa',
    type: 'Travel',
  },

  {
    name: 'FIRST Wealth',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'FIRST Select',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Lifestyle',
  },
  {
    name: 'FIRST Millennia',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Rewards',
  },
  {
    name: 'FIRST Classic',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Rewards',
  },
  {
    name: 'FIRST WOW',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Secured',
  },
  {
    name: 'FIRST SWYP',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Lifestyle',
  },
  {
    name: 'Club Vistara FIRST',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Ashva Credit Card',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa',
    type: 'Premium',
  },

  {
    name: 'LIT Credit Card',
    issuer: 'AU Small Finance Bank',
    network: 'Visa',
    type: 'Customizable',
  },
  {
    name: 'AU ixigo Credit Card',
    issuer: 'AU Small Finance Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Zenith Credit Card',
    issuer: 'AU Small Finance Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Zenith+',
    issuer: 'AU Small Finance Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Altura Plus',
    issuer: 'AU Small Finance Bank',
    network: 'Visa',
    type: 'Rewards',
  },
  {
    name: 'Vetta Credit Card',
    issuer: 'AU Small Finance Bank',
    network: 'Visa',
    type: 'Lifestyle',
  },

  {
    name: 'Legend Credit Card',
    issuer: 'IndusInd Bank',
    network: 'Visa',
    type: 'Lifestyle',
  },
  {
    name: 'Tiger Credit Card',
    issuer: 'IndusInd Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Pioneer Heritage',
    issuer: 'IndusInd Bank',
    network: 'Visa',
    type: 'Premium',
  },
  {
    name: 'Nexxt Credit Card',
    issuer: 'IndusInd Bank',
    network: 'Mastercard',
    type: 'Rewards',
  },

  {
    name: 'OneCard Metal',
    issuer: 'OneCard',
    network: 'Visa',
    type: 'Rewards',
  },
  {
    name: 'Scapia Federal Credit Card',
    issuer: 'Federal Bank',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'SBM Novio Credit Card',
    issuer: 'SBM Bank India',
    network: 'Visa',
    type: 'Rewards',
  },
  {
    name: 'Niyo SBM Credit Card',
    issuer: 'SBM Bank India',
    network: 'Visa',
    type: 'Travel',
  },
  {
    name: 'Jupiter Edge CSB Credit Card',
    issuer: 'CSB Bank',
    network: 'RuPay',
    type: 'Cashback',
  },
  {
    name: 'Kiwi RuPay Credit Card',
    issuer: 'Yes Bank',
    network: 'RuPay',
    type: 'UPI',
  },
  {
    name: 'CRED IndusInd RuPay Credit Card',
    issuer: 'IndusInd Bank',
    network: 'RuPay',
    type: 'Premium',
  },
];

export const CARD_PRODUCT_SEED: CardProductSeed[] = RAW.map((c) => ({
  id: slug(`${c.issuer}-${c.name}`),
  ...c,
  bankCode: bankCodeForIssuer(c.issuer),
}));
