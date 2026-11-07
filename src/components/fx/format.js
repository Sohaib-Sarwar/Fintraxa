export const compactNum = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${Math.round(a)}`;
  return v < 0 ? `−${s}` : s;
};
