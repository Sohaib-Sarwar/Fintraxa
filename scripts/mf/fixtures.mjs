/**
 * Synthetic statements on the real AMC column layouts. Every person, number
 * and identifier here is invented; the column x-positions are copied from
 * the real statements (layout is not personal data). Figures are internally
 * consistent so reconciliation must come out exact.
 */

const W = 4.6; // glyph advance used to derive x-extents
let n = 0;
const txt = (x0, text) => ({ text, x0, x1: x0 + text.length * W });
const num = (xRight, text) => ({ text, x0: xRight - text.length * W, x1: xRight });

/** Build one page of lines from [cell, cell, …] arrays. */
function page(p, rows) {
  n = 0;
  return rows.map((cells) => {
    n += 1;
    return { id: `p${p}-l${n}`, page: p, n, y: 800 - n * 12, text: cells.map((c) => c.text).join('    '), cells };
  });
}

export function atlasStatement() {
  return [page(1, [
    [txt(400, 'Statement of Account')],
    [txt(330, 'For the Period From 01-Oct-2026 to 31-Oct-2026')],
    [txt(7, 'Registration Number : 99887'), txt(1180, 'Account Info')],
    [txt(7, 'Mr. Testa Investorova'), txt(1180, 'Zakat Status : Exempted')],
    [txt(7, 'HOUSE 9, LANE 4, SAMPLE TOWN'), txt(1180, 'Tax Status : Applicable')],
    [txt(7, 'Contact No : 0300-1234567'), txt(1180, 'Print Date : 04/11/2026')],
    [txt(7, 'Atlas Islamic Money Market Fund - Growth Units'), txt(1100, 'Dividend Option: Reinvest')],
    [txt(7, 'Atlas Islamic Money Market Fund')],
    [txt(16, 'NAV Date'), txt(142, 'Transaction'), txt(306, 'Gross Amount'), txt(479, 'CGT'), txt(588, 'Zakat'), txt(680, 'Net Load'),
      txt(791, 'Net Amount'), txt(916, 'Unit Price'), txt(1039, 'No. of Units'), txt(1162, 'Balance Units')],
    [txt(7, 'Opening Balance as of 01-Oct-2026'), num(1249, '-')],
    [txt(7, '08-Oct-2026'), txt(96, 'Online Sale'), num(402, '20,000.00'), num(509, '-'), num(624, '-'), num(739, '-'),
      num(871, '20,000.00'), num(981, '500.0000'), num(1117, '40.0000'), num(1248, '40.0000')],
    [txt(7, '20-Oct-2026'), txt(96, 'Online Redemption'), num(402, '10,100.00'), num(509, '15.00'), num(624, '-'), num(739, '-'),
      num(871, '10,085.00'), num(981, '505.0000'), num(1117, '(20.0000)'), num(1248, '20.0000')],
    [txt(7, 'Closing Balance as of 31-Oct-2026'), num(1249, '20.0000')],
    [txt(7, 'Summary of Investment - As of 31-Oct-2026')],
    [txt(238, 'Fund Name'), txt(565, 'Type of Units'), txt(713, 'Units'), txt(831, 'Unit Price'), txt(982, 'Price Date'), txt(1116, 'Investment Value')],
    [txt(7, 'Atlas Islamic Money Market Fund'), txt(582, 'CLASS A'), num(781, '20.0000'), num(933, '506.0000'), txt(987, '31-Oct-2026'), num(1252, '10,120.00')],
    [txt(7, 'For Atlas Asset Management Limited')],
  ])];
}

export function nbpStatement() {
  return [page(1, [
    [txt(250, 'For the Period 25-SEP-26 to 31-OCT-26')],
    [txt(200, 'NBP ISLAMIC MONEY MARKET FUND')],
    [txt(31, 'Title'), txt(110, 'TESTA INVESTOROVA'), txt(380, 'Account #'), txt(440, '123456')],
    [txt(31, 'Address'), txt(110, 'HOUSE 9, LANE 4, SAMPLE TOWN'), txt(380, 'IBAN:'), txt(440, 'PK00NBPF0000000000123456')],
    [txt(31, 'Investment Plan:'), txt(110, 'Growth')],
    [txt(40, 'Since Inception:'), num(200, '0.00'), num(300, '300.00'), num(400, '0.00'), num(500, '300.00')],
    [txt(51, 'Date'), txt(133, 'Transactions'), txt(239, 'Price Date'), txt(328, 'Units'), txt(403, 'Price'), txt(480, 'Amount')],
    [txt(43, '25-SEP-26'), txt(91, 'Opening Balance')],
    [txt(43, '28-SEP-26'), txt(91, 'Investment'), txt(243, '28-SEP-26'), num(381, '1,000.0000'), num(437, '10.0000'), num(549, '10,000.00')],
    [txt(91, 'Front End Load on Investment'), num(552, '0.00')],
    [txt(91, 'Taxes on Front End Load'), num(552, '0.00')],
    [txt(42, '05-OCT-26'), txt(91, 'Gross SwiftPAY'), txt(242, '04-OCT-26'), num(383, '( 600.0000)'), num(437, '10.5000'), num(552, '( 6,300.00)')],
    [txt(91, 'Capital Gain Tax'), num(555, '( 45.00)')],
    [txt(91, 'Net SwiftPAY'), num(552, '( 6,255.00)')],
    [txt(42, '31-OCT-26'), txt(91, 'Closing Balance'), num(382, '400.0000'), num(437, '0.0000'), num(552, '0.00')],
    [txt(31, 'Note: Please notify any error within (15) working days.')],
    [txt(200, 'NBP Fund Management Limited')],
  ])];
}

const MEEZAN_HEADER = [txt(69, 'Date'), txt(118, 'Transaction Type'), txt(214, 'Inflows (PKR)'), txt(290, 'Outflows (PKR)'),
  txt(360, 'NAV (PKR)'), txt(425, 'No. of Units'), txt(499, 'Unit Balance')];
const mz = (date, type, inflow, outflow, nav, units, bal) => [txt(55, date), txt(115, type), num(274, inflow), num(355, outflow),
  ...(nav ? [num(401, nav)] : []), num(473, units), num(553, bal)];

export function meezanStatement() {
  return [
    page(1, [
      [txt(156, 'AL MEEZAN INVESTMENT MANAGEMENT LTD')],
      [txt(70, 'Customer ID:'), txt(150, '424242'), txt(355, 'Account Information')],
      [txt(70, 'Portfolio No:'), txt(150, '424242-111')],
      [txt(70, 'TESTA INVESTOROVA')],
      [txt(70, 'HOUSE 9 LANE 4 SAMPLE TOWN')],
      [txt(49, '03001234567')],
      [txt(49, 'TESTA@EXAMPLE.COM')],
      [txt(46, 'Balance'), txt(93, 'Summary as at 30-Jun-2026')],
      [txt(46, 'Funds'), txt(108, 'Type'), txt(132, 'of'), txt(146, 'units'), txt(199, 'Units'), txt(259, 'NAV (PKR)')],
      [txt(46, 'MCF'), txt(108, 'GROWTH-C'), num(226, '102.1150'), num(302, '52.0000'), num(383, '5,310'), num(445, '10'), num(529, '10')],
      [txt(46, 'KMIF'), txt(108, 'GROWTH-B'), num(226, '24.5300'), num(302, '101.0000'), num(383, '2,478'), num(445, '-20'), num(529, '-20')],
    ]),
    page(2, [
      [txt(156, 'AL MEEZAN INVESTMENT MANAGEMENT LTD')],
      [txt(502, '424242-111')],
      [txt(43, 'Transaction'), txt(113, 'Details From 01-Jul-2025'), txt(257, 'to'), txt(275, '30-Jun-2026')],
      MEEZAN_HEADER,
      [txt(55, 'MEEZAN CASH FUND (MCF)'), txt(312, 'GROWTH-C')],
      [txt(55, 'Opening unit balance'), num(553, '0.0000')],
      mz('20-Feb-2026', 'PURCHASE', '5,000', '0', '50.0000', '100.0000', '100.0000'),
      // An identical second purchase on the same day: a real second transaction.
      mz('20-Feb-2026', 'PURCHASE', '5,000', '0', '50.0000', '100.0000', '200.0000'),
      mz('26-Feb-2026', 'CONVERT OUT', '0', '2,498', '51.0000', '-49.0196', '150.9804'),
      mz('26-Feb-2026', 'CGT', '0', '2', null, '0.0000', '150.9804'),
      // Same printed outflow, same date, different units and CGT.
      mz('26-Feb-2026', 'CONVERT OUT', '0', '2,498', '51.0000', '-49.0000', '101.9804'),
      mz('26-Feb-2026', 'CGT', '0', '1', null, '0.0000', '101.9804'),
      mz('22-Jun-2026', 'CGT REFUND', '3', '0', '52.0000', '0.0577', '102.0381'),
      mz('24-Jun-2026', 'REFUND OF CAPITAL', '4', '0', '0.0000', '0.0769', '102.1150'),
      [txt(425, 'Unit balance'), num(552, '102.1150')],
      [txt(298, 'Value of investment as on 30-Jun-2026(PKR)'), num(551, '5,310')],
      [txt(55, 'KSE MEEZAN INDEX FUND (KMIF)'), txt(312, 'GROWTH-B')],
      [txt(55, 'Opening unit balance'), num(553, '0.0000')],
      mz('26-Feb-2026', 'CONVERT IN', '2,498', '0', '100.0000', '24.5300', '24.5300'),
      mz('26-Feb-2026', 'TRANSACTION COST', '0', '45', null, '0.0000', '24.5300'),
      [txt(425, 'Unit balance'), num(552, '24.5300')],
      [txt(298, 'Value of investment as on 30-Jun-2026(PKR)'), num(551, '2,478')],
    ]),
  ];
}

const MCB_HEADER = [
  [txt(56, 'Date'), txt(118, 'Nature'), txt(193, 'Units'), txt(252, 'Rate'), txt(305, 'Gross'), txt(358, '**FEL/BEL Load'), txt(450, 'Net Amount'), txt(530, 'Balance Units')],
  [txt(300, 'Amount'), txt(438, 'Inflow/(Outflow)')],
  [txt(361, 'Amount'), txt(408, '%age')],
  [txt(168, 'Inflow/(Outflow)'), txt(311, 'Rs.'), txt(467, 'Rs.')],
  [txt(36, 'MCB CASH MANAGEMENT OPTIMIZER'), txt(429, 'GROWTH')],
];
const mcb = (date, nature, units, rate, gross, net, bal) => [txt(36, date), txt(86, nature),
  ...(units ? [num(222, units)] : []), num(274, rate), num(344, gross), ...(net ? [num(510, net)] : []), ...(Array.isArray(bal) ? bal : [num(597, bal)])];

export function mcbStatement() {
  return [
    page(1, [
      [txt(500, 'Statement Period'), txt(640, 'To'), txt(700, 'OCT-31-2026')],
      [txt(500, 'JUL-01-2026')],
      [txt(52, 'Registration # :'), txt(180, '777001'), txt(494, 'Your Account Information')],
      [txt(52, 'TESTA INVESTOROVA'), txt(500, 'Account No.:'), txt(640, '800000000000000001')],
      [txt(52, 'HOUSE 9 LANE 4 SAMPLE TOWN')],
      ...MCB_HEADER,
      [txt(36, '30-JUN-26'), txt(81, 'Last Balance'), num(585, '.0000')],
      mcb('15-JUL-26', 'Online Investment -', '100.0000', '100.0000', '10,000', '10,000', '100.0000'),
      [txt(86, 'TESTA')], [txt(86, 'INVESTOROVA -')], [txt(86, 'PK00ABCD0000000000001234')],
      mcb('27-JUL-26', 'iPayment-', '(50.0000)', '101.0000', '5,050', null, '50.0000'),
      [txt(86, 'TESTA')], [txt(86, 'INVESTOROVA')], [txt(86, 'PK00ABCD00000000')], [txt(86, '12345678-UBL-')],
      [txt(37, 'Registration #.'), txt(119, '777001'), txt(476, 'Page 1 of 2')],
      [txt(36, 'MCB Investment Management Limited')],
    ]),
    page(2, [
      ...MCB_HEADER,
      // Description continues across the page break.
      [txt(86, '148033')],
      mcb('27-JUL-26', 'CGT*', null, '101.0000', '(8)', '(5,042)', '50.0000'),
      mcb('05-AUG-26', 'APP REDEMPTION', '(50.0001)', '102.0000', '5,100.01', null, [txt(548, '-'), num(599, '.0001')]),
      mcb('05-AUG-26', 'CGT*', null, '102.0000', '(10)', '(5,090.01)', [txt(548, '-'), num(599, '.0001')]),
      mcb('06-AUG-26', 'Online Investment -', '10.0000', '102.0000', '1,020', '1,020', '9.9999'),
      [txt(86, 'TESTA INVESTOROVA -')],
      [txt(41, 'Value of'), txt(74, 'MCBCMO'), num(173, '9.9999'), txt(212, 'Units based on Repurchase price of Rs.'), num(384, '102.5000'), txt(398, 'as on'), txt(425, '30 OCT 2026'), txt(474, 'is Rs.'), num(594, '1,024.99')],
      [txt(36, 'MCB Investment Management Limited')],
      [txt(36, '-Please quote your registration No. in all future correspondence.')],
    ]),
  ];
}

const UBL_HEAD = (fund) => [
  [txt(27, `For ${fund} - Class 'B'`)],
  [txt(603, 'Customer lD'), txt(700, '00999999-1'), txt(785, 'Type'), txt(850, 'e-Account')],
  [txt(27, '00999999-1')],
  [txt(27, 'TESTA INVESTOROVA')],
  [txt(27, 'Transaction Details (January 01, 2026 To October 31, 2026)')],
  [txt(181, 'Gross'), txt(339, 'CGTax /'), txt(422, 'Net Unit Price'), txt(506, 'Price')],
  [txt(27, 'Date &Type of'), txt(174, 'Amount'), txt(253, 'Load'), txt(284, 'Charges'), txt(351, 'Tax'), txt(404, 'Amount'), txt(454, '(NAV)'), txt(485, 'Applicable'), txt(565, 'Number of'), txt(626, 'Balance')],
  [txt(27, 'Transaction'), txt(186, '(Rs.)'), txt(234, '(Rs.) - (%)'), txt(299, '(Rs.)'), txt(354, '(Rs.)'), txt(417, '(Rs.)'), txt(458, '(Rs.)'), txt(508, 'Date'), txt(585, 'Units'), txt(637, 'Units')],
];
const ubl = (label, gross, cgt, net, nav, pdate, units, bal) => [txt(27, label), num(205, gross), ...(cgt !== null ? [num(370, cgt)] : []),
  num(444, net), num(486, nav), txt(494, pdate), num(604, units), num(655, bal)];

export function ublStatement() {
  return [
    page(1, [
      [txt(435, 'Statement Period: January 01, 2026 To October 31, 2026')],
      [txt(27, 'Your Transaction Statement')],
      ...UBL_HEAD('AL-AMEEN ISLAMIC CASH FUND'),
      [txt(26, 'Opening Units (As on January 1, 2026):')],
      [txt(26, '24-02-2026')],
      ubl('Initial Purchase', '1,000', null, '1,000', '100.0000', '23-02-2026', '10.00', '10.00'),
      [txt(26, '27-02-2026')],
      ubl('Conversion To (USF)', '(500)', '0', '( 500)', '100.0000', '27-02-2026', '( 5.00)', '5.00'),
      ubl('Additional Purchase', '2,000', null, '2,000', '100.0000', '27-02-2026', '20.00', '25.00'),
      [txt(26, '14-04-2026')],
      ubl('Redemption (Withdrawal)', '(1,530)', '3', '( 1,527)', '102.0000', '14-04-2026', '( 15.00)', '10.00'),
      [txt(26, '03-07-2026')],
      [txt(38, 'IMPORTANT: This is an auto-generated report. Report any discrepancy to: UBL Fund Managers - Operations Office.')],
    ]),
    page(2, [
      ...UBL_HEAD('AL-AMEEN ISLAMIC CASH FUND'),
      ubl('Additional Purchase', '45', null, '45', '101.0000', '22-06-2026', '0.45', '10.45'),
      [txt(27, '(CGT-Refund)')],
      [txt(27, 'Closing Units (As on October 31, 2026):'), num(656, '10.4500')],
      [txt(36, 'The value of your investment in AICF is Rs.1,060 (valued @ October 31, 2026 price i.e. 101.4000).')],
      [txt(38, 'IMPORTANT: UBL Fund Managers. Contact info@UBLFunds.com')],
    ]),
  ];
}
