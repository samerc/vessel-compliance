# Sanctions API Integration Guide

Base URL: `https://sanctions.fancyshark.com`

This guide explains how to integrate the Sanctions List API into your project to screen individuals and entities against OFAC, EU, and UN sanctions lists.

---

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search` | Search sanctions lists |
| GET | `/api/status` | Get API status and statistics |
| GET | `/health` | Health check |

---

## Search API

### Request

```
GET https://sanctions.fancyshark.com/api/search?q={query}
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `q` | Yes | - | Name or alias to search |
| `mode` | No | `both` | `exact`, `fuzzy`, or `both` |
| `source` | No | all | Filter: `OFAC`, `EU`, `UN` |
| `type` | No | all | Filter: `individual`, `entity`, `vessel`, `aircraft` |
| `threshold` | No | `0.6` | Fuzzy match sensitivity (0-1) |
| `limit` | No | `100` | Max results (1-1000) |

### Response

```json
{
  "query": "Putin",
  "mode": "both",
  "total": 5,
  "results": [
    {
      "match_type": "exact",
      "score": 1.0,
      "entity": {
        "source": "OFAC",
        "source_id": "35096",
        "entity_type": "individual",
        "name": "Vladimir Vladimirovich PUTIN",
        "aliases": ["Vladimir PUTIN"],
        "date_of_birth": "07 Oct 1952",
        "nationality": "Russia",
        "addresses": ["Kremlin, Moscow, Russia"],
        "programs": ["RUSSIA-EO14024"]
      }
    }
  ]
}
```

---

## Integration Examples

### JavaScript / TypeScript

```javascript
const SANCTIONS_API = 'https://sanctions.fancyshark.com';

async function checkSanctions(name, options = {}) {
  const params = new URLSearchParams({
    q: name,
    mode: options.mode || 'both',
    threshold: options.threshold || 0.6,
    limit: options.limit || 100,
    ...(options.source && { source: options.source }),
    ...(options.type && { type: options.type })
  });

  const response = await fetch(`${SANCTIONS_API}/api/search?${params}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Quick sanction check
async function isSanctioned(name, threshold = 0.8) {
  const result = await checkSanctions(name, { threshold, limit: 1 });
  return result.total > 0 && result.results[0].score >= threshold;
}

// Usage
const results = await checkSanctions('Vladimir Putin');
console.log(`Found ${results.total} matches`);

if (await isSanctioned('John Doe')) {
  console.log('WARNING: Sanctioned entity detected!');
}
```

### Python

```python
import requests

SANCTIONS_API = 'https://sanctions.fancyshark.com'

def check_sanctions(name, mode='both', source=None, entity_type=None,
                    threshold=0.6, limit=100):
    """Search the sanctions database."""
    params = {
        'q': name,
        'mode': mode,
        'threshold': threshold,
        'limit': limit
    }
    if source:
        params['source'] = source
    if entity_type:
        params['type'] = entity_type

    response = requests.get(f'{SANCTIONS_API}/api/search', params=params)
    response.raise_for_status()
    return response.json()

def is_sanctioned(name, threshold=0.8):
    """Quick check if a name is on any sanctions list."""
    result = check_sanctions(name, threshold=threshold, limit=1)
    return result['total'] > 0 and result['results'][0]['score'] >= threshold

# Usage
results = check_sanctions('Vladimir Putin', source='OFAC')
for match in results['results']:
    print(f"{match['entity']['name']} - Score: {match['score']}")

if is_sanctioned('John Doe'):
    print('WARNING: Sanctioned entity detected!')
```

### C# / .NET

```csharp
using System.Net.Http;
using System.Text.Json;
using System.Web;

public class SanctionsClient
{
    private readonly HttpClient _http;
    private const string BaseUrl = "https://sanctions.fancyshark.com";

    public SanctionsClient()
    {
        _http = new HttpClient();
    }

    public async Task<SanctionsResponse> SearchAsync(string query,
        string mode = "both", string source = null, double threshold = 0.6)
    {
        var url = $"{BaseUrl}/api/search?q={HttpUtility.UrlEncode(query)}" +
                  $"&mode={mode}&threshold={threshold}";

        if (!string.IsNullOrEmpty(source))
            url += $"&source={source}";

        var json = await _http.GetStringAsync(url);
        return JsonSerializer.Deserialize<SanctionsResponse>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    }

    public async Task<bool> IsSanctionedAsync(string name, double threshold = 0.8)
    {
        var result = await SearchAsync(name, threshold: threshold);
        return result.Total > 0 && result.Results[0].Score >= threshold;
    }
}

// Models
public record SanctionsResponse(string Query, int Total, List<SanctionMatch> Results);
public record SanctionMatch(string MatchType, double Score, SanctionedEntity Entity);
public record SanctionedEntity(string Source, string Name, string EntityType,
    List<string> Aliases, string Nationality);

// Usage
var client = new SanctionsClient();
var results = await client.SearchAsync("Putin");
bool isSanctioned = await client.IsSanctionedAsync("John Doe");
```

### PHP

```php
<?php
define('SANCTIONS_API', 'https://sanctions.fancyshark.com');

function checkSanctions($name, $options = []) {
    $params = array_merge([
        'q' => $name,
        'mode' => 'both',
        'threshold' => 0.6,
        'limit' => 100
    ], $options);

    $url = SANCTIONS_API . '/api/search?' . http_build_query($params);

    $response = file_get_contents($url);
    if ($response === false) {
        throw new Exception('Failed to connect to Sanctions API');
    }

    return json_decode($response, true);
}

function isSanctioned($name, $threshold = 0.8) {
    $result = checkSanctions($name, ['threshold' => $threshold, 'limit' => 1]);
    return $result['total'] > 0 && $result['results'][0]['score'] >= $threshold;
}

// Usage
$results = checkSanctions('Putin', ['source' => 'OFAC']);
foreach ($results['results'] as $match) {
    echo $match['entity']['name'] . " - Score: " . $match['score'] . "\n";
}

if (isSanctioned('John Doe')) {
    echo "WARNING: Sanctioned entity!";
}
```

### cURL

```bash
# Basic search
curl "https://sanctions.fancyshark.com/api/search?q=Putin"

# Filtered search
curl "https://sanctions.fancyshark.com/api/search?q=bank&source=OFAC&type=entity"

# Check API status
curl "https://sanctions.fancyshark.com/api/status"
```

### PowerShell

```powershell
$BaseUrl = "https://sanctions.fancyshark.com"

function Search-Sanctions {
    param(
        [Parameter(Mandatory)]
        [string]$Query,
        [string]$Source,
        [double]$Threshold = 0.6
    )

    $url = "$BaseUrl/api/search?q=$([uri]::EscapeDataString($Query))&threshold=$Threshold"
    if ($Source) { $url += "&source=$Source" }

    Invoke-RestMethod -Uri $url
}

# Usage
$results = Search-Sanctions -Query "Putin" -Source "OFAC"
$results.results | ForEach-Object {
    Write-Host "$($_.entity.name) - Score: $($_.score)"
}
```

---

## Understanding Scores

| Score | Meaning |
|-------|---------|
| `1.0` | Exact match |
| `0.8 - 0.99` | Very close match (minor variations) |
| `0.6 - 0.79` | Partial match (may include typos) |
| `< 0.6` | Weak match (use with caution) |

**Recommendation**: Use `threshold=0.8` for compliance checks to reduce false positives.

---

## Best Practices

1. **Cache results** - Sanctions lists don't change frequently; cache for 1-24 hours
2. **Handle errors** - Implement retry logic for network failures
3. **Use appropriate thresholds** - Higher threshold = fewer false positives
4. **Log all checks** - Keep audit trails for compliance
5. **Batch requests** - If checking multiple names, space out requests

---

## Status Check

Verify the API is operational:

```bash
curl https://sanctions.fancyshark.com/api/status
```

Response includes total entities loaded and last update timestamps for each source.

---

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request (missing `q` parameter) |
| 500 | Server error |

Always check the response status and handle errors gracefully in production code.
