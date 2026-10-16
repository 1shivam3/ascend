$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "F:\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "F:\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;" + $env:PATH

$gradleBat = "F:\.gradle\wrapper\dists\gradle-8.10.2-all\7iv73wktx1xtkvlq19urqw1wm\gradle-8.10.2\bin\gradle.bat"

Write-Host "Building ASCEND Native Android APK with JDK 21..."
Write-Host "Java: $env:JAVA_HOME"
Write-Host "SDK:  $env:ANDROID_HOME"

Set-Location "android"
& $gradleBat assembleDebug --no-daemon
