/**
 * Dumps the ontology pack (concepts + synonyms, relations, moods) to JSON so the review
 * workbook builder (scripts/build-review-xlsx.py) can list every synonym for the client.
 *
 *   npx tsx scripts/v2-export-ontology.mts > .scratch/ontology.json
 */
import { FURNITURE_PACK } from "../packages/assistant-engine/src/index.js";
process.stdout.write(JSON.stringify(FURNITURE_PACK));
