export function exportCsv(name: string, rows: (string | number)[][]) {
  const csv = "\uFEFF" + rows.map(row => row.map(v => `"${String(v).replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a"); link.href = url; link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
}
