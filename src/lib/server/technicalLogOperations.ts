import { db } from '$lib/server/db';
import { createTechnicalLogStore, type TechnicalLogFilters } from './db/technicalLogStore';

const store = createTechnicalLogStore(db);

export const technicalLogOperations = {
  async list(filters: TechnicalLogFilters) {
    const page = await store.list(filters);
    return {
      ...page,
      records: page.records.map(({ id: _id, ...record }) => record)
    };
  }
};
