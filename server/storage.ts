// No database storage needed — files are processed transiently
export interface IStorage {}
export class MemStorage implements IStorage {}
export const storage = new MemStorage();
