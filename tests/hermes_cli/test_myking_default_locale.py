from hermes_cli.config_defaults import DEFAULT_CONFIG


def test_managed_my_king_defaults_new_profiles_to_simplified_chinese():
    assert DEFAULT_CONFIG["display"]["language"] == "zh"
