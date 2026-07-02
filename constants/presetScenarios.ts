import { PresetScenario } from '../types/chat';

export const PRESET_SCENARIOS: PresetScenario[] = [
  { id: 'thermal-printer', label: 'Thermal printer offline', message: 'The thermal receipt printer at my POS terminal is offline and not printing receipts.' },
  { id: 'scanner-fail', label: 'Barcode scanner not working', message: 'The barcode scanner at my counter is not reading any product tags.' },
  { id: 'cash-drawer', label: 'Cash drawer jammed', message: 'The cash drawer at my register is jammed and will not open.' },
  { id: 'pos-frozen', label: 'POS terminal frozen', message: 'My POS terminal screen is frozen and not responding to any input.' },
  { id: 'network-down', label: 'Store internet down', message: 'The store internet connection is down and we cannot process any sales.' },
];
