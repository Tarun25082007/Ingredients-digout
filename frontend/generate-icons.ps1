Add-Type -AssemblyName System.Drawing
$width1 = 192
$width2 = 512
$colors = @([System.Drawing.Color]::FromArgb(6, 78, 59)) # #064e3b (primary-dark)

function Create-Icon {
    param($size, $filename)
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear($colors[0])
    
    $font = New-Object System.Drawing.Font("Arial", ($size/4), [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $graphics.DrawString("D", $font, $brush, $rect, $format)
    
    $bitmap.Save("D:\git\anti projects\digout\frontend\public\$filename", [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}

Create-Icon 192 "pwa-192x192.png"
Create-Icon 512 "pwa-512x512.png"
Create-Icon 180 "apple-touch-icon.png"
