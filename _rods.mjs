
import { RODS_BY_PRICE, rodArt, RODS } from './vendor/fru-angler/fishing.js';
console.log('rod            price   width  colour    length  tip');
for (const id of RODS_BY_PRICE) {
  const a = rodArt(id);
  const end = a.path.split('L')[1].trim().split(/\s+/).map(Number);
  const len = Math.hypot(end[0]-40.7, end[1]-52).toFixed(1);
  console.log(`${RODS[id].name.padEnd(14)} ${String(RODS[id].price).padStart(5)}  ${String(a.width).padStart(5)}  ${a.colour}  ${String(len).padStart(6)}  ${a.tipX},${a.tipY}`);
}
const looks = new Set(RODS_BY_PRICE.map((id) => JSON.stringify(rodArt(id))));
console.log(`\ndistinct appearances: ${looks.size} of ${RODS_BY_PRICE.length}`);
