export const openDatabaseAsync = async () => ({
  execAsync: async () => {},
  runAsync: async () => ({ lastInsertRowId: 1, changes: 1 }),
  getFirstAsync: async () => null,
  getAllAsync: async () => [],
  withTransactionAsync: async (cb: any) => cb(),
});
