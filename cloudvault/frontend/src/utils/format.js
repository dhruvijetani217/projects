export function fmtBytes(b) {
  if (!b) return '0 B';
  if (b >= 1099511627776) return (b/1099511627776).toFixed(2)+' TB';
  if (b >= 1073741824)    return (b/1073741824).toFixed(2)+' GB';
  if (b >= 1048576)       return (b/1048576).toFixed(1)+' MB';
  if (b >= 1024)          return (b/1024).toFixed(0)+' KB';
  return b+' B';
}
export function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
export function fmtDateTime(d) {
  return new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
export function daysLeft(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}
