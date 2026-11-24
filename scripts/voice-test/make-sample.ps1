# Makes a robot-voice sample and the exact moment each word is spoken (for testing the delay, not accuracy).
param([int]$Rate = 3, [string]$Out = "voice-tests\timed")
Add-Type -AssemblyName System.Speech
$text = "Good morning church I am glad to see everybody today. Please turn with me to the book of Romans chapter eight verse twenty eight and let us read it together with one voice because there is power in agreement. When Joseph was thrown into the pit by his brothers, God was watching. When Joseph was sold to strangers and carried to Egypt, the Lord remained beside him. When Potiphar's wife lied and the prison door closed, heaven had already written tomorrow. Somebody shout hallelujah. Now move quickly to Philippians chapter four verse thirteen because strength does not come from money or education or family connections but from Christ who lives inside you, and whoever understands that mystery will never again bow down before fear, poverty, sickness or shame."
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = $Rate
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile("$PWD\$Out.wav", $fmt)
$script:words = New-Object System.Collections.ArrayList
$id = Register-ObjectEvent -InputObject $s -EventName SpeakProgress -MessageData $script:words -Action { [void]$Event.MessageData.Add(@{ word = $Event.SourceEventArgs.Text; at = $Event.SourceEventArgs.AudioPosition.TotalSeconds }) }
$s.SpeakAsync($text) | Out-Null
while ($s.State -ne "Ready") { Start-Sleep -Milliseconds 100 }
Start-Sleep -Milliseconds 500
$s.Dispose()
[IO.File]::WriteAllText("$PWD\$Out.json", (ConvertTo-Json @($script:words) -Compress))
"$($script:words.Count) words"
