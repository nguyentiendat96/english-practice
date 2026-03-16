// ============================================
// MAIN DATA: Combines all category data + general pools
// ============================================
const APP_DATA = {
  airport: AIRPORT_DATA,
  office: OFFICE_DATA,
  canteen: CANTEEN_DATA,
  daily: DAILY_DATA,
  general1: GENERAL_DATA_1,
  general2: GENERAL_DATA_2,
  general3: GENERAL_DATA_3,
  general4: GENERAL_DATA_4,
  general5: GENERAL_DATA_5,
  general6: GENERAL_DATA_6,
  general7: GENERAL_DATA_7,
};

// All vocabulary combined for Daily 100 Challenge
const ALL_VOCABULARY = [
  ...AIRPORT_DATA.vocabulary,
  ...OFFICE_DATA.vocabulary,
  ...CANTEEN_DATA.vocabulary,
  ...DAILY_DATA.vocabulary,
  ...GENERAL_VOCAB_1,
  ...GENERAL_VOCAB_2,
  ...GENERAL_VOCAB_3,
  ...GENERAL_VOCAB_4,
  ...GENERAL_VOCAB_5,
  ...GENERAL_VOCAB_6,
  ...GENERAL_VOCAB_7,
];
