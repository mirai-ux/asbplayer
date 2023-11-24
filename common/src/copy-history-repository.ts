import { CopyHistoryItem, FileModel, SubtitleModel } from '@project/common';
import Dexie, { liveQuery, Observable } from 'dexie';

class CopyHistoryDatabase extends Dexie {
    copyHistoryItems!: Dexie.Table<CopyHistoryRecord, number>;

    constructor() {
        super('CopyHistoryDatabase');
        this.version(1).stores({
            copyHistoryItems: '++index,id,timestamp',
        });
        this.version(2)
            .stores({
                copyHistoryItems: '++index,id,timestamp',
            })
            .upgrade((trans) => {
                return trans
                    .table('copyHistoryItems')
                    .toCollection()
                    .modify((item) => {
                        const subtitle: SubtitleModel = {
                            text: item.text,
                            textImage: item.textImage,
                            start: item.start,
                            end: item.end,
                            originalStart: item.originalStart,
                            originalEnd: item.originalEnd,
                            track: item.track,
                        };
                        item.subtitle = subtitle;
                        delete item.text;
                        delete item.textImage;
                        delete item.start;
                        delete item.end;
                        delete item.originalStart;
                        delete item.originalEnd;
                        delete item.track;

                        if (item.videoFileName || item.audioFileName) {
                            const file: FileModel = {
                                name: item.videoFileName || item.audioFileName,
                                blobUrl: '',
                                playbackRate: item.filePlaybackRate,
                                audioTrack: item.audioTrack,
                            };
                            item.file = file;

                            delete item.videoFileName;
                            delete item.audioFileName;
                            delete item.filePlaybackRate;
                            delete item.audioTrack;
                        }
                    });
            });
    }
}

interface CopyHistoryRecord extends CopyHistoryItem {
    index?: number;
}

export default class CopyHistoryRepository {
    private readonly _db = new CopyHistoryDatabase();
    private _limit: number;

    constructor(limit: number) {
        this._limit = limit;
    }

    set limit(limit: number) {
        this._limit = limit;
    }

    async clear() {
        await this._db.delete();
    }

    async fetch(count: number): Promise<CopyHistoryItem[]> {
        if (count <= 0) {
            return [];
        }

        const result = await await this._db.copyHistoryItems.reverse().limit(count).toArray();
        result.reverse();
        return result;
    }

    liveFetch(count: number): Observable<CopyHistoryItem[]> {
        return liveQuery(() => {
            return this.fetch(count);
        });
    }

    async save(item: CopyHistoryItem) {
        if (this._limit <= 0) {
            return;
        }

        const record: CopyHistoryRecord = { ...item };
        const existingPrimaryKeys = await this._db.copyHistoryItems.where('id').equals(item.id).primaryKeys();

        if (existingPrimaryKeys.length > 0) {
            record.index = existingPrimaryKeys[0];
        }

        const index = await this._db.copyHistoryItems.put(record);
        await this._prune(index);
    }

    private async _prune(lastIndex: number) {
        const size = await this._db.copyHistoryItems.count();

        if (size > this._limit) {
            const keys = await this._db.copyHistoryItems
                .where('index')
                .belowOrEqual(lastIndex - this._limit)
                .primaryKeys();

            if (keys.length > 0) {
                await this._db.copyHistoryItems.bulkDelete(keys);
            }
        }
    }

    async delete(id: string) {
        const keys = await this._db.copyHistoryItems.where('id').equals(id).primaryKeys();
        await this._db.copyHistoryItems.bulkDelete(keys);
    }
}
