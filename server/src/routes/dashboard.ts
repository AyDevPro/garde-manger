import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from '../lib/http.js';
import { BATCH_SELECT, mapBatch } from '../lib/stock.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', wrap(async (req, res) => {
  const hid = req.session!.household_id;

  const counts = await query(
    `SELECT
       count(*)                                                              AS total,
       count(*) FILTER (WHERE b.effective_date < CURRENT_DATE)               AS expired,
       count(*) FILTER (WHERE b.effective_date = CURRENT_DATE)               AS today,
       count(*) FILTER (WHERE b.effective_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 3) AS next3,
       count(*) FILTER (WHERE b.effective_date BETWEEN CURRENT_DATE + 4 AND CURRENT_DATE + 7) AS week,
       count(*) FILTER (WHERE b.effective_date > CURRENT_DATE + 7)           AS later,
       count(*) FILTER (WHERE b.effective_date IS NULL)                      AS nodate
     FROM batch_effective b
     JOIN product p ON p.id = b.product_id
    WHERE b.household_id = $1 AND b.status = 'active' AND p.archived_at IS NULL`,
    [hid],
  );

  // Ce qui presse : déjà dépassé ou dans les 7 jours, du plus urgent au moins.
  const urgent = await query(
    `${BATCH_SELECT}
      WHERE b.household_id = $1 AND b.status = 'active' AND p.archived_at IS NULL
        AND b.effective_date IS NOT NULL AND b.effective_date <= CURRENT_DATE + 7
      ORDER BY b.effective_date, p.name LIMIT 8`,
    [hid],
  );

  const locations = await query(
    `SELECT l.id, l.name, l.tone, l.kind,
            (SELECT count(*) FROM batch b WHERE b.location_id = l.id AND b.status = 'active') AS count
       FROM location l
      WHERE l.household_id = $1 AND l.archived_at IS NULL
      ORDER BY l.position, l.name`,
    [hid],
  );

  // Un échantillon de noms par tranche, pour l'écran Dates.
  const samples = await query(
    `SELECT bucket, string_agg(name, ', ' ORDER BY effective_date) AS sample FROM (
       SELECT p.name, b.effective_date,
              CASE WHEN b.effective_date IS NULL                                            THEN 'nodate'
                   WHEN b.effective_date <  CURRENT_DATE                                    THEN 'expired'
                   WHEN b.effective_date =  CURRENT_DATE                                    THEN 'today'
                   WHEN b.effective_date <= CURRENT_DATE + 3                                THEN 'next3'
                   WHEN b.effective_date <= CURRENT_DATE + 7                                THEN 'week'
                   ELSE 'later' END AS bucket,
              row_number() OVER (PARTITION BY
                CASE WHEN b.effective_date IS NULL        THEN 'nodate'
                     WHEN b.effective_date <  CURRENT_DATE THEN 'expired'
                     WHEN b.effective_date =  CURRENT_DATE THEN 'today'
                     WHEN b.effective_date <= CURRENT_DATE + 3 THEN 'next3'
                     WHEN b.effective_date <= CURRENT_DATE + 7 THEN 'week'
                     ELSE 'later' END
                ORDER BY b.effective_date NULLS LAST, p.name) AS rn
         FROM batch_effective b JOIN product p ON p.id = b.product_id
        WHERE b.household_id = $1 AND b.status = 'active' AND p.archived_at IS NULL
     ) t WHERE rn <= 2 GROUP BY bucket`,
    [hid],
  );

  const c = counts.rows[0];
  res.json({
    counts: {
      total: Number(c.total), expired: Number(c.expired), today: Number(c.today),
      next3: Number(c.next3), week: Number(c.week), later: Number(c.later), nodate: Number(c.nodate),
    },
    urgent: urgent.rows.map(mapBatch),
    locations: locations.rows.map((l) => ({
      id: l.id, name: l.name, tone: l.tone, kind: l.kind, count: Number(l.count),
    })),
    samples: Object.fromEntries(samples.rows.map((s) => [s.bucket, s.sample as string])),
  });
}));
