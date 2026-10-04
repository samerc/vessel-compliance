// Vite `?raw` import of the schema file (bundled as a string by electron-vite)
declare module '*.sql?raw' {
  const sql: string
  export default sql
}
