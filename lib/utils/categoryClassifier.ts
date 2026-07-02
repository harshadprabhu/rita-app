import { TicketCategory } from '../../constants/categories';
import { TicketPriority } from '../../types';

interface KeywordRule {
  category: TicketCategory;
  subcategory: string;
  keywords: string[];
}

const RULES: KeywordRule[] = [
  // ── Application Issues ─────────────────────────────────────────────────────

  {
    category: 'application_issues',
    subcategory: 'ERP - Finance',
    keywords: [
      'erp finance', 'finance module', 'finance erp', 'erp finance module',
      'accounts', 'ledger', 'general ledger', 'chart of accounts',
      'payment entry', 'payment not posting', 'payment processing',
      'financial report', 'financial statement', 'financial module',
      'tally', 'tally erp', 'tally not working', 'tally error',
      'invoice', 'bill payment', 'bills payable', 'bills receivable',
      'journal entry', 'journal voucher', 'voucher entry',
      'trial balance', 'balance sheet', 'profit and loss', 'p&l',
      'accounts payable', 'accounts receivable',
      'gst', 'tax report', 'gst report', 'gst not filing', 'gst error',
      'cash flow', 'bank reconciliation', 'bank statement',
      'credit note', 'debit note', 'receipt voucher', 'payment voucher',
      'petty cash', 'cash entry',
      'month end', 'year end', 'closing entries', 'period closing',
      'depreciation', 'asset register', 'fixed assets',
      'cost center', 'budget entry', 'budget variance',
      'expense entry', 'expense report', 'reimbursement',
    ],
  },

  {
    category: 'application_issues',
    subcategory: 'ERP - ISCM',
    keywords: [
      'iscm', 'erp iscm', 'erp supply chain',
      'supply chain', 'supply chain management',
      'procurement', 'purchase order', 'po not generated', 'po not raised',
      'purchase requisition', 'pr not approved', 'indent',
      'vendor', 'vendor invoice', 'vendor payment', 'vendor portal', 'vendor master',
      'inventory management', 'inventory count', 'stocktaking', 'stock audit',
      'stock transfer', 'inter-store transfer', 'inter store transfer',
      'replenishment', 'store replenishment', 'reorder', 'minimum stock',
      'stock count', 'stock level', 'stock out', 'out of stock',
      'stock discrepancy', 'stock adjustment', 'stock mismatch',
      'warehouse', 'warehouse management',
      'goods receipt', 'grn', 'goods return', 'return to vendor',
      'delivery challan', 'dc', 'dispatched not received',
      'material issue', 'material receipt', 'material transfer',
      'quotation', 'rfq', 'request for quotation',
    ],
  },

  {
    category: 'application_issues',
    subcategory: 'ERP - Merch',
    keywords: [
      'merch', 'merchandise', 'erp merch', 'erp merchandise',
      'product catalog', 'product catalogue', 'item catalog',
      'assortment', 'collection', 'range planning', 'buying plan',
      'buying', 'open to buy', 'otb',
      'sku', 'style', 'style code', 'item code', 'product code',
      'item master', 'product setup', 'new product', 'product creation',
      'product not found', 'item not found', 'item not showing', 'product missing',
      'category management', 'sub-category', 'product classification',
      'design', 'design code', 'article', 'article code',
      'tag', 'price tag', 'tag printing', 'barcode not mapped',
      'hallmark', 'karatage', 'karat', 'purity',
      'making charges', 'wastage', 'product weight', 'metal weight',
      'pricing', 'product price', 'selling price', 'mrp', 'rate not updated',
      'master data', 'master not updated',
    ],
  },

  {
    category: 'application_issues',
    subcategory: 'Marketing',
    keywords: [
      'marketing', 'marketing app', 'marketing module', 'marketing software',
      'campaign', 'email campaign', 'sms campaign', 'whatsapp campaign',
      'promotion', 'promotional sms', 'bulk sms', 'sms not sending',
      'crm', 'customer relationship',
      'customer data', 'customer record', 'customer not found', 'customer profile',
      'loyalty', 'loyalty points', 'loyalty program', 'loyalty card',
      'reward points', 'points not credited', 'points not reflecting',
      'membership', 'member card', 'member not found',
      'scheme', 'birthday offer', 'anniversary offer', 'offer not applied',
      'discount not working', 'coupon', 'coupon not working',
      'whatsapp', 'whatsapp not sending', 'whatsapp blast',
      'notification not sending', 'push notification',
      'marketing report', 'campaign report', 'open rate', 'click rate',
      'customer list', 'customer segment', 'segment',
    ],
  },

  {
    category: 'application_issues',
    subcategory: 'POS',
    keywords: [
      'pos', 'pos not working', 'pos crash', 'pos slow', 'pos error', 'pos login',
      'point of sale', 'billing software', 'billing system', 'billing machine',
      'billing counter', 'billing error', 'billing issue', 'billing not working',
      'bill not generated', 'bill not printing', 'bill print',
      'retail software', 'retail pos',
      'receipt', 'receipt printer', 'thermal printer', 'pos printer',
      'invoice issue', 'sale invoice', 'gst invoice', 'invoice number',
      'payment terminal', 'card machine', 'card reader', 'card swipe',
      'payment not processing', 'card payment failed', 'upi not working',
      'split payment', 'partial payment',
      'exchange', 'return', 'sale return', 'item return',
      'sale entry', 'sale not posting', 'transaction not posted',
      'day closing', 'z report', 'day end', 'shift closing', 'closing',
      'cash drawer', 'drawer not opening',
      'pos session', 'opening cash', 'closing cash',
    ],
  },

  {
    category: 'application_issues',
    subcategory: 'Power BI',
    keywords: [
      'power bi', 'powerbi', 'power bi report', 'bi report',
      'dashboard', 'bi dashboard', 'analytics dashboard',
      'report not loading', 'report blank', 'report error', 'report not opening',
      'visual not loading', 'chart not loading',
      'data not refreshing', 'refresh failed', 'scheduled refresh', 'auto refresh',
      'dataset', 'gateway', 'data gateway', 'gateway error',
      'pbix', 'power bi file',
      'power bi access', 'bi access', 'report access', 'no access to report',
      'publish report', 'report published',
      'kpi', 'kpi not showing', 'performance report',
      'store report', 'daily report', 'weekly report', 'monthly report',
      'sales dashboard', 'analytics report', 'analytics not loading',
    ],
  },

  {
    category: 'application_issues',
    subcategory: 'Other',
    keywords: [
      'application error', 'app not working', 'app crashing', 'app crash',
      'software crash', 'software not opening', 'not responding', 'application issue',
      'error message', 'error code', 'unknown error',
      'cannot login', 'login error', 'login failed', 'login not working',
      'session expired', 'timeout', 'session timeout',
      'access denied', 'permission denied', 'no access',
      'application down', 'system not working', 'page not loading', 'loading error',
      'blank screen',
    ],
  },

  // ── Data and Reporting ─────────────────────────────────────────────────────

  {
    category: 'data_and_reporting',
    subcategory: 'Data and Reporting - Issues',
    keywords: [
      'data report', 'report issue', 'reporting issue',
      'wrong data', 'incorrect data', 'data incorrect', 'data not correct',
      'incorrect report', 'report showing wrong', 'wrong figures in report',
      'missing data', 'data missing in report', 'column missing',
      'data mismatch', 'figures not matching', 'mismatch in report', 'numbers not matching',
      'report error', 'data discrepancy',
      'wrong figure', 'incorrect figure', 'numbers wrong',
      'data not correct',
      'report blank', 'blank report',
      'filter not working', 'filter issue',
      'export issue', 'excel download', 'data export', 'download not working',
      'report not generating', 'report not running', 'slow report',
      'wrong stock in report', 'stock mismatch in report',
      'sales mismatch', 'incorrect sales report', 'incorrect sales figure',
      'report not accurate',
    ],
  },

  // ── Data Sync Issue ────────────────────────────────────────────────────────

  {
    category: 'data_sync_issue',
    subcategory: 'ERP-DW Data Issues',
    keywords: [
      'data sync', 'sync issue', 'sync failed', 'sync error', 'sync not working',
      'data not syncing', 'data not synced',
      'erp dw', 'data warehouse', 'dw issue', 'dw not updated',
      'replication', 'replication failed',
      'data not updated', 'data not reflecting', 'not reflecting in report',
      'data not flowing', 'data pipeline', 'data feed', 'data integration',
      'etl', 'etl failed', 'etl error',
      'yesterday data missing', 'today data not available', 'latest data not showing',
      'data delay', 'data lag', 'data not live', 'real time data not showing',
      'old data showing', 'stale data', 'data stale',
      'erp data not in', 'erp to dw',
      'warehouse not updated', 'historical data missing',
      'data not transferred',
    ],
  },

  // ── Digital Issues ─────────────────────────────────────────────────────────

  {
    category: 'digital_issues',
    subcategory: 'Indriya Website',
    keywords: [
      'indriya website', 'indriyajewellery', 'indriya.com',
      'website issue', 'website not working', 'website down', 'website error',
      'website slow', 'website not loading', 'site not loading',
      'web page', 'site error', 'page not opening',
      'online store', 'e-commerce', 'ecommerce',
      'product page', 'product not visible on website', 'catalogue not showing online',
      'checkout issue', 'cart issue', 'online checkout',
      'online order', 'website order',
      'website payment', 'payment gateway', 'payment failed on website',
      'wrong price on website', 'price on website',
      'image not loading on website',
      'contact form', 'enquiry form',
      'website content', 'website update',
    ],
  },

  {
    category: 'digital_issues',
    subcategory: 'Saksham',
    keywords: [
      'saksham', 'saksham portal', 'saksham login', 'saksham access', 'saksham not working',
      'saksham app', 'saksham error',
      'learning portal', 'training portal', 'e-learning', 'elearning',
      'learning management', 'lms',
      'course not loading', 'course access', 'training course', 'training module',
      'module not loading', 'module not completing',
      'certification', 'training video', 'video not playing',
      'quiz not working', 'assessment not working',
      'cannot complete course', 'training not showing', 'course completion',
      'learning app', 'staff training', 'online training',
    ],
  },

  {
    category: 'digital_issues',
    subcategory: 'Solitaire',
    keywords: [
      'solitaire', 'solitaire app', 'solitaire not working', 'solitaire login',
      'solitaire access', 'solitaire error',
      'diamond order', 'solitaire order', 'diamond booking', 'solitaire booking',
      'diamond not found', 'diamond catalog', 'solitaire catalog',
      'diamond request', 'diamond details', 'diamond purchase',
      'carat', 'stone order', 'diamond availability',
      'diamond not available', 'solitaire not available',
    ],
  },

  {
    category: 'digital_issues',
    subcategory: 'Sparkle',
    keywords: [
      'sparkle', 'sparkle app', 'sparkle not working', 'sparkle login',
      'sparkle access', 'sparkle error', 'sparkle catalog',
      'selling app', 'salesman app', 'sales app',
      'customer journey', 'end to end customer',
      'ornament details', 'ornament not found',
      'stone weight', 'stone details', 'product weight in sparkle',
      'jewellery catalog', 'jewelry catalog', 'catalogue not loading',
      'gold scheme', 'customer scheme', 'scheme not showing',
      'purchase history', 'customer profile sparkle',
      'showcase product', 'product demo',
    ],
  },

  // ── Facility / Maintenance ─────────────────────────────────────────────────

  {
    category: 'facility_maintenance',
    subcategory: 'Facility Equipment Incident',
    keywords: [
      'facility', 'maintenance', 'housekeeping',
      'air conditioner', 'air conditioning', 'ac not working', 'ac not cooling',
      'hvac', 'fan not working', 'exhaust fan',
      'light not working', 'lights not working', 'lighting issue',
      'lights flickering', 'tube light', 'led not working',
      'electrical', 'electrical issue', 'fuse blown', 'fuse issue',
      'switchboard', 'power socket', 'socket not working', 'extension board',
      'power failure', 'power cut', 'power outage', 'no power',
      'generator', 'generator not starting', 'dg set',
      'ups', 'ups not working', 'ups beeping', 'battery backup',
      'plumbing', 'water leakage', 'water seepage', 'ceiling leak', 'roof leak',
      'tap not working', 'washroom issue', 'restroom issue',
      'lift not working', 'elevator', 'elevator not working',
      'building issue', 'civil work',
      'furniture', 'broken furniture', 'chair broken', 'table broken',
      'door not closing', 'lock issue', 'shutter issue',
      'fire alarm', 'smoke detector', 'fire extinguisher',
      'cctv', 'cctv camera', 'cctv not working', 'security camera',
      'display showcase', 'showcase light', 'jewellery display light',
      'store temperature', 'billing counter broken',
      'pest control', 'cleaning issue',
    ],
  },

  // ── Franchisee Service ─────────────────────────────────────────────────────

  {
    category: 'franchisee_service',
    subcategory: 'Franchisee Incident',
    keywords: [
      'franchisee', 'franchise', 'franchisee issue', 'franchise issue',
      'franchise store', 'franchisee store', 'franchise outlet',
      'franchise partner', 'franchise support',
      'franchise login', 'franchise access', 'franchise system',
      'franchise it issue', 'franchise erp', 'franchise software',
      'franchise setup', 'new franchise', 'franchise onboarding',
      'dealer', 'dealer issue', 'dealer problem', 'dealer store',
      'partner store', 'sub-dealer',
      'outlet problem', 'outlet issue',
      'franchise network', 'franchise connectivity',
      'franchise billing', 'franchise pos',
    ],
  },

  // ── Infrastructure Issues ──────────────────────────────────────────────────

  {
    category: 'infrastructure_issues',
    subcategory: 'Email',
    keywords: [
      'email not sending', 'email not receiving', 'email not working',
      'mail not sending', 'mail not receiving', 'mail not working',
      'cannot send mail', 'cannot receive mail',
      'inbox empty', 'inbox not loading',
      'email setup', 'email configuration', 'email account', 'email id creation',
      'new email account', 'corporate email',
      'outlook', 'outlook not opening', 'outlook crash', 'outlook not working',
      'office 365', 'o365', 'microsoft 365',
      'email password', 'forgot email password', 'email login',
      'mail server', 'email server', 'smtp', 'imap',
      'email blocked', 'email bouncing', 'email not delivered', 'undelivered mail',
      'email going to spam', 'spam',
      'attachment not sending', 'large attachment',
      'email signature', 'email quota', 'inbox full', 'mailbox full',
      'junk mail',
      'reply not working', 'forward email',
      'auto reply', 'out of office',
      'calendar invite', 'meeting invite', 'calendar not syncing',
    ],
  },

  {
    category: 'infrastructure_issues',
    subcategory: 'Hardware',
    keywords: [
      'computer', 'laptop', 'desktop', 'pc',
      'cpu', 'system', 'workstation',
      'monitor', 'screen', 'display', 'screen not working', 'no display',
      'blank screen', 'black screen', 'flickering screen', 'dim screen',
      'hdmi', 'vga', 'display cable', 'display not working',
      'keyboard', 'keyboard not working', 'keys not working',
      'mouse', 'mouse not working', 'touchpad', 'trackpad',
      'hard drive', 'hard disk', 'hdd', 'ssd', 'disk full', 'out of storage',
      'storage',
      'usb', 'usb port', 'usb not working', 'usb not detected',
      'pendrive', 'pen drive', 'usb drive', 'external drive', 'device not recognized',
      'printer', 'printer not printing', 'printer offline', 'printer error',
      'printer jam', 'paper jam', 'ink cartridge', 'toner',
      'scanner', 'scanner not working', 'scanning issue',
      'barcode', 'barcode scanner', 'barcode reader', 'barcode not reading',
      'label printer', 'receipt printer', 'thermal printer',
      'ram', 'memory',
      'slow computer', 'computer hanging', 'system slow', 'computer freezing',
      'computer not starting', 'system not booting', 'computer not turning on',
      'overheating', 'fan noise', 'laptop fan',
      'battery', 'laptop not charging', 'charging not working',
      'headset', 'headphone', 'webcam', 'camera', 'microphone',
      'speaker', 'audio not working', 'no sound', 'sound issue',
      'hardware issue', 'device not working', 'hardware failure',
      'data cable',
    ],
  },

  {
    category: 'infrastructure_issues',
    subcategory: 'Infosecurity',
    keywords: [
      'virus', 'malware', 'ransomware', 'trojan', 'spyware', 'adware', 'worm',
      'hacked', 'account hacked', 'system hacked',
      'security breach', 'data breach', 'data leak', 'sensitive data leaked',
      'phishing', 'suspicious email', 'suspicious link', 'fake email', 'fraud email',
      'firewall', 'antivirus', 'windows defender', 'endpoint protection',
      'unauthorized access', 'suspicious activity', 'suspicious login',
      'password stolen', 'credentials stolen', 'identity theft',
      'pop-up ads', 'browser hijacked', 'redirected', 'browser redirect',
      'encrypted files', 'files locked', 'ransom',
      'security alert', 'security warning',
      'mfa', 'two factor', 'two-factor', '2fa',
      'account lockout', 'locked out', 'multiple login attempts', 'brute force',
      'cyber attack', 'intrusion', 'suspicious file',
      'infosecurity', 'it security', 'cyber security',
    ],
  },

  {
    category: 'infrastructure_issues',
    subcategory: 'Network',
    keywords: [
      'no internet', 'internet not working', 'internet down', 'internet issue',
      'internet slow', 'slow internet', 'slow connection',
      'network down', 'network not working', 'network is down', 'no network',
      'network outage', 'network failure', 'network slow', 'network disconnected',
      'wifi', 'wi-fi', 'wifi not working', 'wifi not connecting',
      'cannot connect to wifi', 'wifi password', 'wifi issue', 'wifi down',
      'broadband', 'broadband issue', 'broadband down', 'isp', 'jio', 'airtel', 'bsnl',
      'router', 'router not working', 'router reboot', 'router down',
      'modem', 'network switch', 'access point', 'range extender',
      'ethernet', 'ethernet cable', 'network cable', 'cable disconnected', 'lan',
      'no connection', 'disconnected', 'connection dropping', 'intermittent connection',
      'network issue', 'network problem', 'network access',
      'vpn', 'vpn not connecting', 'vpn disconnecting', 'vpn issue',
      'remote access', 'rdp', 'remote desktop',
      'cannot connect to server', 'server not accessible',
      'bandwidth', 'low bandwidth', 'upload slow', 'download slow',
      'packet loss', 'ping', 'latency', 'high latency',
      'ip address', 'ip conflict', 'dns', 'dhcp',
      'proxy', 'firewall blocking', 'port blocked',
      'website blocked', 'site blocked', 'access blocked',
      'network configuration', 'static ip',
    ],
  },

  {
    category: 'infrastructure_issues',
    subcategory: 'Software',
    keywords: [
      'windows', 'windows update', 'windows error', 'windows crash', 'windows not starting',
      'operating system', 'os issue',
      'blue screen', 'bsod',
      'install', 'software installation', 'install not working',
      'uninstall', 'remove software',
      'update', 'update failed', 'upgrade', 'software update failed',
      'license', 'software license', 'license key', 'product key',
      'activation', 'activation failed', 'not activated', 'trial expired', 'software expired',
      'driver', 'driver issue', 'driver not installed', 'driver update',
      'software not opening', 'program not responding', 'slow performance',
      'computer slow', 'system slow after update',
      'microsoft office', 'ms office', 'office not working',
      'word not opening', 'excel not opening', 'excel crash', 'excel not responding',
      'powerpoint not opening', 'powerpoint crash',
      'teams', 'microsoft teams', 'teams not working', 'teams crash',
      'adobe', 'pdf software', 'pdf not opening', 'adobe reader', 'acrobat',
      'java', 'dll error', 'missing file', 'corrupted file',
      'shortcut not working', 'startup program',
      'software configuration', 'software settings',
      'software compatibility', 'program not compatible',
      'registry', 'system restore',
    ],
  },
];

export function classifyTicket(description: string): { category: TicketCategory; subcategory: string } {
  const lower = description.toLowerCase();

  const scoreMap = new Map<string, { category: TicketCategory; subcategory: string; score: number }>();

  for (const rule of RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.length;
      }
    }
    if (score === 0) continue;

    const key = `${rule.category}|${rule.subcategory}`;
    const existing = scoreMap.get(key);
    if (!existing || score > existing.score) {
      scoreMap.set(key, { category: rule.category, subcategory: rule.subcategory, score });
    }
  }

  if (!scoreMap.size) {
    return { category: 'application_issues', subcategory: 'Other' };
  }

  let best = { category: 'application_issues' as TicketCategory, subcategory: 'Other', score: 0 };
  for (const entry of scoreMap.values()) {
    if (entry.score > best.score) {
      best = entry;
    }
  }

  return { category: best.category, subcategory: best.subcategory };
}

// Keyword → priority rules, checked high-to-low. First matching tier wins;
// falls back to 'medium' when nothing matches. Tune these freely — they are
// plain substring checks, no AI involved.
const PRIORITY_KEYWORDS: { priority: TicketPriority; keywords: string[] }[] = [
  {
    priority: 'critical',
    keywords: [
      'pos down', 'pos is down', 'cannot process sales', 'can not process sales',
      'unable to bill', 'billing down', 'cannot bill', 'no sales', 'store closed',
      'system down', 'server down', 'everything down', 'all terminals', 'data loss',
      'security breach', 'hacked', 'payment failed for all', 'outage',
    ],
  },
  {
    priority: 'high',
    keywords: [
      'not working', 'not responding', 'frozen', 'crash', 'crashed', 'crashing',
      'offline', 'cannot login', 'can not login', 'unable to login', 'down',
      'stuck', 'jammed', 'failed', 'failure', 'error', 'urgent', 'asap',
      'scanner not', 'printer not', 'drawer not', 'terminal not',
    ],
  },
  {
    priority: 'low',
    keywords: [
      'question', 'how do i', 'how to', 'request', 'enhancement', 'suggestion',
      'whenever', 'no rush', 'minor', 'cosmetic', 'typo', 'slow sometimes',
    ],
  },
];

export function inferPriority(description: string): TicketPriority {
  const lower = description.toLowerCase();
  for (const tier of PRIORITY_KEYWORDS) {
    if (tier.keywords.some((kw) => lower.includes(kw))) {
      return tier.priority;
    }
  }
  return 'medium';
}

// Full keyword triage used by the RITA bot: classify + prioritise + build a
// human-readable summary line — entirely local, no API key.
export function triageMessage(message: string): {
  category: TicketCategory;
  subcategory: string;
  priority: TicketPriority;
  summary: string;
} {
  const { category, subcategory } = classifyTicket(message);
  const priority = inferPriority(message);
  const firstLine = message.trim().split('\n')[0];
  const summary = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
  return { category, subcategory, priority, summary };
}
