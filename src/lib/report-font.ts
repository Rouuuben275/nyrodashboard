import {readFileSync} from "node:fs";
import path from "node:path";
export const reportFont=()=>readFileSync(path.join(process.cwd(),"src/assets/report-font.ttf"));
