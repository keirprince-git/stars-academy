// pdf-parse ships no type declarations. Declare it so TS doesn't flag an
// implicit-any import. The library is used only in the bank statement importer.
declare module "pdf-parse";
