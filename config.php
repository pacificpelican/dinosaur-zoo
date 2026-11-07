<?php
// Dinosaurs & Friends Zoo - default configuration.
// Do not put secrets here. Copy config.local.example.php to config.local.php (git-ignored) to override.
return array_replace_recursive([
    'storage' => [
        // auto: MySQL if configured, else SQLite if the extension exists, else flat JSON files
        'driver' => 'auto', // auto | json | sqlite | mysql
        'path'   => __DIR__ . '/storage', // keep outside the web root in production
        'mysql'  => ['host' => '127.0.0.1', 'port' => 3306, 'name' => '', 'user' => '', 'pass' => ''],
    ],
    'session' => [
        // Enable only after verifying that the web server denies access to .sessions.
        'allow_webroot_fallback' => false,
    ],
    'ai' => [
        'tier'   => 'auto', // auto | ollama | cloud | off
        'ollama' => ['url' => 'http://127.0.0.1:11434', 'model' => 'llama3.2'],
        'cloud'  => ['url' => '', 'key' => '', 'model' => ''], // any OpenAI-compatible /chat/completions endpoint
        'timeout' => 12, // seconds
    ],
], is_file(__DIR__ . '/config.local.php') ? (require __DIR__ . '/config.local.php') : []);
