import type { ID } from '../types';

/**
 * SequenceQueue — очередь «без повторов» для последовательного режима.
 *
 * На каждый блок строится один раз перемешанный «мешок» картинок.
 * next() отдаёт следующую картинку; когда мешок кончается, начинается
 * новый круг В ТОМ ЖЕ порядке (поведение выберет пользователь:
 * «начать заново с первой»).
 *
 * Очередь не сохраняется в проект: она derives из папок-источников,
 * поэтому после переоткрытия проекта просто строится заново.
 * Если состав пула изменился (добавили папку, загрузили другой каталог) —
 * очередь перестраивается автоматически.
 */
export class SequenceQueue {
  private bags = new Map<ID, ID[]>();
  private cursors = new Map<ID, number>();
  private signatures = new Map<ID, string>();

  private signature(pool: ID[]): string {
    return `${pool.length}:${pool.join(',')}`;
  }

  /** Пересобрать очередь блока заново (новый случайный порядок) */
  rebuild(blockId: ID, pool: ID[], rng: () => number = Math.random): ID[] {
    const bag = [...pool];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    this.bags.set(blockId, bag);
    this.cursors.set(blockId, 0);
    this.signatures.set(blockId, this.signature(pool));
    return bag;
  }

  /** Гарантирует актуальную очередь для блока */
  private ensure(blockId: ID, pool: ID[], rng?: () => number): ID[] {
    const sig = this.signature(pool);
    const current = this.bags.get(blockId);
    if (!current || this.signatures.get(blockId) !== sig) {
      return this.rebuild(blockId, pool, rng);
    }
    return current;
  }

  /**
   * Следующая картинка для блока.
   * Возвращает null, если пул пуст (нечего показывать).
   */
  next(
    blockId: ID,
    pool: ID[],
    rng?: () => number
  ): { assetId: ID | null; position: number; total: number; cycle: number } {
    if (pool.length === 0) {
      return { assetId: null, position: 0, total: 0, cycle: 0 };
    }
    const bag = this.ensure(blockId, pool, rng);
    const cursor = this.cursors.get(blockId) ?? 0;
    const assetId = bag[cursor % bag.length];
    const cycle = Math.floor(cursor / bag.length);
    this.cursors.set(blockId, cursor + 1);
    return { assetId, position: (cursor % bag.length) + 1, total: bag.length, cycle };
  }

  /** Сколько картинок осталось до конца круга */
  remaining(blockId: ID, pool: ID[]): { left: number; total: number } {
    const bag = this.ensure(blockId, pool);
    const cursor = this.cursors.get(blockId) ?? 0;
    const left = bag.length - (cursor % bag.length);
    return { left: left === bag.length ? bag.length : left, total: bag.length };
  }

  resetBlock(blockId: ID): void {
    this.bags.delete(blockId);
    this.cursors.delete(blockId);
    this.signatures.delete(blockId);
  }

  reset(): void {
    this.bags.clear();
    this.cursors.clear();
    this.signatures.clear();
  }
}

/** Единственный экземпляр на приложение */
export const sequenceQueue = new SequenceQueue();
