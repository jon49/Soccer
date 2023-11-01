#!/usr/bin/env nu

let configPath = ("../soccer-server/config.json" | path expand)
let args = [ "--config", $configPath]
^v run ../SimpleServer $args

