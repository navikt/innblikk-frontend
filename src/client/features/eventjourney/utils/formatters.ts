export const formatNumber = (num: number) => num.toLocaleString('nb-NO')

export const getPercentage = (count: number, total: number) => {
  if (!total) return '0.0%'
  return ((count / total) * 100).toFixed(1) + '%'
}
