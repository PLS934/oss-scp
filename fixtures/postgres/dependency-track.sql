-- 합성 예제 스키마입니다. 실제 운영 Dependency Track 스키마 계약이 아닙니다.
CREATE TABLE projects(id bigint PRIMARY KEY, name text NOT NULL, severity text, updated_at timestamptz NOT NULL);
CREATE TABLE components(id bigint PRIMARY KEY, name text NOT NULL, severity text, updated_at timestamptz NOT NULL);
CREATE TABLE sscs(id bigint PRIMARY KEY, name text NOT NULL, severity text, updated_at timestamptz NOT NULL);

CREATE INDEX projects_updated_at_idx ON projects(updated_at, id);
CREATE INDEX components_updated_at_idx ON components(updated_at, id);
CREATE INDEX sscs_updated_at_idx ON sscs(updated_at, id);

-- 운영 시 별도 관리자가 다음과 같이 최소 권한 계정을 구성합니다.
-- CREATE ROLE dependency_track_reader LOGIN PASSWORD '<secret>';
-- GRANT CONNECT ON DATABASE dependency_track TO dependency_track_reader;
-- GRANT USAGE ON SCHEMA public TO dependency_track_reader;
-- GRANT SELECT ON projects, components, sscs TO dependency_track_reader;
