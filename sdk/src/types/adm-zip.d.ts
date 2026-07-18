declare module 'adm-zip' {
  type ZipEntry = {
    attr: number
    entryName: string
    header: { method: number }
  }

  export default class AdmZip {
    constructor(input?: string | Buffer | Record<string, unknown>)
    addFile(
      entryName: string,
      content: Buffer | string,
      comment?: string,
      attributes?: number | import('node:fs').Stats,
    ): ZipEntry
    getEntries(): ZipEntry[]
    writeZip(targetFileName: string): void
  }
}
