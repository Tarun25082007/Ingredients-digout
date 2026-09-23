
$json = Get-Content 'd:\git\anti projects\digout\scratch_in_oreo.json' -Raw | ConvertFrom-Json
$count = $json.products.Count
Write-Host "Count: $count"
foreach ($p in $json.products) {
    Write-Host "---"
    Write-Host ("Name: " + $p.product_name)
    Write-Host ("Code: " + $p.code)
    Write-Host ("Has ingredients: " + (![string]::IsNullOrWhiteSpace($p.ingredients_text)))
    if (![string]::IsNullOrWhiteSpace($p.ingredients_text)) {
        Write-Host ("Ingredients: " + $p.ingredients_text.Substring(0, [Math]::Min(100, $p.ingredients_text.Length)) + "...")
    }
}
