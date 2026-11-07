import { makeFixture, startServer, check, summary, readJson } from './lib.js';

console.log('\n=== Payterm List & Server Validation Tests (R2) ===');

export async function stagePayterms() {
  const dir = makeFixture();
  const srv = await startServer(dir, 3995);

  try {
    // 1. Logins
    const ow = await srv.login('Kamran_Bhatti', 'ownerpass1');
    check('Owner logs in', ow.ok);

    const ag = await srv.login('agent_one', 'agentpass1');
    check('Agent logs in', ag.ok);

    const mg = await srv.login('mgr_one', 'mgrpass11');
    check('Manager logs in', mg.ok);

    const cl = await srv.login('client_one', 'clientpass1');
    check('Client logs in', cl.ok);

    // 2. Master payterm list in settings default exactly: Weekly, 1/1, 7/1, 7/7, 15/15, 15/30, Monthly60
    const setRes = await srv.api('GET', '/api/settings', { cookie: ow.cookie });
    check('Settings has payterms array', setRes.status === 200 && Array.isArray(setRes.data.payterms));
    const expectedDefaults = ['Weekly', '1/1', '7/1', '7/7', '15/15', '15/30', 'Monthly60'];
    const hasAllDefaults = expectedDefaults.every(d => (setRes.data.payterms || []).includes(d));
    check('Settings contains exactly master payterms default list', hasAllDefaults);

    // Client/Agent safeSettings also includes payterms
    const safeSetRes = await srv.api('GET', '/api/settings', { cookie: ag.cookie });
    check('Non-owner settings includes master payterms list', safeSetRes.status === 200 && Array.isArray(safeSetRes.data.payterms));

    // Dedicated /api/payterms endpoint
    const ptRes = await srv.api('GET', '/api/payterms');
    check('GET /api/payterms returns master payterms list', ptRes.status === 200 && Array.isArray(ptRes.data.payterms));

    // 3. Editable by Owner only
    const nonOwnerSet = await srv.api('POST', '/api/settings', { cookie: ag.cookie, body: { payterms: ['Weekly'] } });
    check('Non-owner cannot edit settings (403)', nonOwnerSet.status === 403);

    const nonOwnerPt = await srv.api('POST', '/api/payterms', { cookie: ag.cookie, body: { payterms: ['Weekly'] } });
    check('Non-owner cannot edit /api/payterms (403)', nonOwnerPt.status === 403);

    const ownerPt = await srv.api('POST', '/api/payterms', { cookie: ow.cookie, body: { payterms: ['Weekly', '1/1', '7/1', '7/7', '15/15', '15/30', 'Monthly60', 'CustomTerm'] } });
    check('Owner can update /api/payterms (200)', ownerPt.status === 200 && (ownerPt.data.payterms || []).includes('CustomTerm'));

    // Reset back to exact defaults
    await srv.api('POST', '/api/payterms', { cookie: ow.cookie, body: { payterms: expectedDefaults } });

    // 4. Server validates payterm values: reject unknown strings with 400
    // (a) Range creation
    const badRangeCreate = await srv.api('POST', '/api/numbers/sms-ranges', {
      cookie: ow.cookie,
      body: {
        country: 'BadRangeTest',
        prefix: '9999',
        company_cost: 0.02,
        payterms: { 'UnknownTermXYZ': 0.015 }
      }
    });
    check('Server rejects unknown payterm on range create with 400', badRangeCreate.status === 400);

    // (b) Range patch
    const badRangePatch = await srv.api('PATCH', '/api/numbers/sms-ranges/1', {
      cookie: ow.cookie,
      body: {
        payterms: { 'IllegalNet45': 0.015 }
      }
    });
    check('Server rejects unknown payterm on range patch with 400', badRangePatch.status === 400);

    // (c) Single assign to agent
    const badAssignAg = await srv.api('POST', '/api/numbers/1/assign', {
      cookie: mg.cookie,
      body: {
        target_type: 'agent',
        target_id: 1,
        payterm: 'InvalidAgPayterm'
      }
    });
    check('Server rejects unknown payterm on agent assign with 400', badAssignAg.status === 400);

    // (d) Single assign to client
    const badAssignCl = await srv.api('POST', '/api/numbers/4/assign', {
      cookie: ag.cookie,
      body: {
        target_type: 'client',
        target_id: 1,
        client_payterm: 'InvalidClPayterm'
      }
    });
    check('Server rejects unknown client_payterm on client assign with 400', badAssignCl.status === 400);

    // (e) Bulk assign
    const badBulk = await srv.api('POST', '/api/numbers/bulk-assign-many', {
      cookie: ag.cookie,
      body: {
        number_ids: [4],
        target_id: 1,
        client_payterm: 'BadBulkPayterm'
      }
    });
    check('Server rejects unknown payterm on bulk-assign-many with 400', badBulk.status === 400);

    // 5. Server accepts valid master payterms
    const goodRangeCreate = await srv.api('POST', '/api/numbers/sms-ranges', {
      cookie: ow.cookie,
      body: {
        range_name: 'MasterPT Valid Range',
        country: 'ValidLand',
        prefix: '8888',
        company_cost: 0.02,
        payterms: {
          'Weekly': 0.012,
          '1/1': 0.012,
          '7/1': 0.013,
          '7/7': 0.0135,
          '15/15': 0.014,
          '15/30': 0.0145,
          'Monthly60': 0.015
        }
      }
    });
    check('Server accepts all valid master payterms on range create', goodRangeCreate.status === 200);

    // 6. Migrate old keys: 15/1 -> 15/15, 30/1 -> Monthly60, Daily -> 1/1 without losing rates
    // (a) 15/1 -> 15/15
    const mig15 = await srv.api('POST', '/api/numbers/sms-ranges', {
      cookie: ow.cookie,
      body: {
        range_name: 'Migrate15 Range',
        country: 'Migrate15',
        prefix: '7771',
        company_cost: 0.02,
        payterms: {
          'Weekly': 0.012,
          '15/1': 0.014
        }
      }
    });
    check('Migrate 15/1 -> 15/15 succeeds (200)', mig15.status === 200);
    check('Migrate 15/1 preserves rate on 15/15 key', Number(mig15.data.payterms?.['15/15']) === 0.014);

    // (b) 30/1 -> Monthly60
    const mig30 = await srv.api('POST', '/api/numbers/sms-ranges', {
      cookie: ow.cookie,
      body: {
        range_name: 'Migrate30 Range',
        country: 'Migrate30',
        prefix: '7772',
        company_cost: 0.02,
        payterms: {
          'Weekly': 0.012,
          '30/1': 0.016
        }
      }
    });
    check('Migrate 30/1 -> Monthly60 succeeds (200)', mig30.status === 200);
    check('Migrate 30/1 preserves rate on Monthly60 key', Number(mig30.data.payterms?.['Monthly60']) === 0.016);

    // (c) Daily -> 1/1
    const migDaily = await srv.api('POST', '/api/numbers/sms-ranges', {
      cookie: ow.cookie,
      body: {
        range_name: 'MigrateDaily Range',
        country: 'MigrateDaily',
        prefix: '7773',
        company_cost: 0.02,
        payterms: {
          'Weekly': 0.012,
          'Daily': 0.011
        }
      }
    });
    check('Migrate Daily -> 1/1 succeeds (200)', migDaily.status === 200);
    check('Migrate Daily preserves rate on 1/1 key', Number(migDaily.data.payterms?.['1/1']) === 0.011);

  } finally {
    await srv.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await stagePayterms();
  const ok = summary('PAYTERMS R2');
  process.exit(ok ? 0 : 1);
}
