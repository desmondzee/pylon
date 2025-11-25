-- Add sample coordinates for grid zones in the UK
-- These are example coordinates for common data center regions

-- Update existing grid zones with approximate UK data center coordinates
-- Format: { "lat": latitude, "lng": longitude }

-- North Scotland (Inverness area)
UPDATE grid_zones SET coordinates = '{"lat": 57.4778, "lng": -4.2247}'::jsonb
WHERE region LIKE '%North Scotland%' OR region LIKE '%N SCOT%' OR grid_zone_code LIKE '%N-SCOT%';

-- South Scotland (Glasgow/Edinburgh area)
UPDATE grid_zones SET coordinates = '{"lat": 55.8642, "lng": -4.2518}'::jsonb
WHERE region LIKE '%South Scotland%' OR region LIKE '%S SCOT%' OR grid_zone_code LIKE '%S-SCOT%';

-- North West England (Manchester area)
UPDATE grid_zones SET coordinates = '{"lat": 53.4808, "lng": -2.2426}'::jsonb
WHERE region LIKE '%North West%' OR region LIKE '%N WEST%' OR region LIKE '%Manchester%' OR grid_zone_code LIKE '%N-WEST%';

-- North East England (Newcastle area)
UPDATE grid_zones SET coordinates = '{"lat": 54.9783, "lng": -1.6178}'::jsonb
WHERE region LIKE '%North East%' OR region LIKE '%N EAST%' OR region LIKE '%Newcastle%' OR grid_zone_code LIKE '%N-EAST%';

-- Yorkshire (Leeds area)
UPDATE grid_zones SET coordinates = '{"lat": 53.8008, "lng": -1.5491}'::jsonb
WHERE region LIKE '%Yorkshire%' OR region LIKE '%YORK%' OR region LIKE '%Leeds%' OR grid_zone_code LIKE '%YORK%';

-- North Wales (Wrexham area)
UPDATE grid_zones SET coordinates = '{"lat": 53.0415, "lng": -2.9936}'::jsonb
WHERE region LIKE '%North Wales%' OR region LIKE '%N WALES%' OR grid_zone_code LIKE '%N-WALES%';

-- South Wales (Cardiff area)
UPDATE grid_zones SET coordinates = '{"lat": 51.4816, "lng": -3.1791}'::jsonb
WHERE region LIKE '%South Wales%' OR region LIKE '%S WALES%' OR region LIKE '%Cardiff%' OR grid_zone_code LIKE '%S-WALES%';

-- West Midlands (Birmingham area)
UPDATE grid_zones SET coordinates = '{"lat": 52.4862, "lng": -1.8904}'::jsonb
WHERE region LIKE '%West Midlands%' OR region LIKE '%W MID%' OR region LIKE '%Birmingham%' OR grid_zone_code LIKE '%W-MID%';

-- East Midlands (Nottingham area)
UPDATE grid_zones SET coordinates = '{"lat": 52.9548, "lng": -1.1581}'::jsonb
WHERE region LIKE '%East Midlands%' OR region LIKE '%E MID%' OR region LIKE '%Nottingham%' OR grid_zone_code LIKE '%E-MID%';

-- East England (Cambridge area)
UPDATE grid_zones SET coordinates = '{"lat": 52.2053, "lng": 0.1218}'::jsonb
WHERE region LIKE '%East England%' OR region LIKE '%E ENG%' OR region LIKE '%Cambridge%' OR grid_zone_code LIKE '%E-ENG%';

-- South West England (Bristol area)
UPDATE grid_zones SET coordinates = '{"lat": 51.4545, "lng": -2.5879}'::jsonb
WHERE region LIKE '%South West%' OR region LIKE '%S WEST%' OR region LIKE '%Bristol%' OR grid_zone_code LIKE '%S-WEST%';

-- South England (Southampton area)
UPDATE grid_zones SET coordinates = '{"lat": 50.9097, "lng": -1.4044}'::jsonb
WHERE region LIKE '%South England%' OR region LIKE '%SOUTH%' OR region LIKE '%Southampton%' OR grid_zone_code LIKE '%SOUTH%'
AND region NOT LIKE '%South West%' AND region NOT LIKE '%South Wales%' AND region NOT LIKE '%South East%' AND region NOT LIKE '%South Scotland%';

-- London
UPDATE grid_zones SET coordinates = '{"lat": 51.5074, "lng": -0.1278}'::jsonb
WHERE region LIKE '%London%' OR grid_zone_code LIKE '%LONDON%';

-- South East England (Reading area)
UPDATE grid_zones SET coordinates = '{"lat": 51.4543, "lng": -0.9781}'::jsonb
WHERE region LIKE '%South East%' OR region LIKE '%S EAST%' OR region LIKE '%Reading%' OR grid_zone_code LIKE '%S-EAST%';

-- Additional common data center naming patterns
UPDATE grid_zones SET coordinates = '{"lat": 51.5074, "lng": -0.1278}'::jsonb
WHERE zone_name LIKE '%UK-South%' OR zone_name LIKE '%London%' AND coordinates IS NULL;

UPDATE grid_zones SET coordinates = '{"lat": 53.4808, "lng": -2.2426}'::jsonb
WHERE zone_name LIKE '%UK-North%' OR zone_name LIKE '%Manchester%' AND coordinates IS NULL;

UPDATE grid_zones SET coordinates = '{"lat": 52.4862, "lng": -1.8904}'::jsonb
WHERE zone_name LIKE '%UK-West%' OR zone_name LIKE '%Birmingham%' AND coordinates IS NULL;

UPDATE grid_zones SET coordinates = '{"lat": 52.2053, "lng": 0.1218}'::jsonb
WHERE zone_name LIKE '%UK-East%' OR zone_name LIKE '%Cambridge%' AND coordinates IS NULL;

-- Verification query
SELECT
    zone_name,
    grid_zone_code,
    region,
    coordinates
FROM grid_zones
WHERE coordinates IS NOT NULL
ORDER BY zone_name;

-- Count zones with coordinates
SELECT
    COUNT(*) as total_zones,
    COUNT(coordinates) as zones_with_coords,
    COUNT(*) - COUNT(coordinates) as zones_without_coords
FROM grid_zones;
