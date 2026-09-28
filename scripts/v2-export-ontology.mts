/**
 * Dumps the ontology pack the tour runs with (code pack + the client's edits) to JSON, for the
 * database workbook (scripts/febal_database.py): concepts + synonyms, relations, moods.
 *
 *   npx tsx scripts/v2-export-ontology.mts [tour=febal-casa] > .scratch/ontology.json
 */
import { loadPack } from "./load-pack.js";
process.stdout.write(JSON.stringify(loadPack(process.argv[2] ?? "febal-casa")));
