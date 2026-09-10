// Sorts strings like "Group 2" before "Group 10" instead of lexicographically
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

module.exports = { naturalCompare };
