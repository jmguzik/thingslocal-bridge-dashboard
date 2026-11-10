"""Verify metadata does not disclose unreadable devices, areas or identifiers."""
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace as NS
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).parents[1] / 'custom_components/thingslocal_dashboard'


def mod(name, **attributes):
    result = ModuleType(name); result.__dict__.update(attributes); return result


class WebSocketTests(unittest.TestCase):
    def setUp(self):
        package = mod('thingslocal_ws_test'); package.__path__ = [str(ROOT)]
        api = mod('websocket_api', websocket_command=lambda schema: lambda fn: fn, async_register_command=Mock())
        self.entity_registry = NS(entities={})
        self.device_registry = NS(devices={})
        self.area_registry = NS(areas={})
        modules = {
            'thingslocal_ws_test': package, 'voluptuous': mod('voluptuous', Required=lambda value: value),
            'homeassistant': mod('homeassistant'),
            'homeassistant.auth.permissions.const': mod('permissions', POLICY_READ='read', POLICY_CONTROL='control'),
            'homeassistant.components': mod('components', websocket_api=api),
            'homeassistant.core': mod('core', callback=lambda fn: fn),
            'homeassistant.helpers': mod('helpers',
                entity_registry=NS(async_get=lambda _: self.entity_registry),
                device_registry=NS(async_get=lambda _: self.device_registry),
                area_registry=NS(async_get=lambda _: self.area_registry)),
        }
        self.patch = patch.dict(sys.modules, modules); self.patch.start(); self.addCleanup(self.patch.stop)
        spec = importlib.util.spec_from_file_location('thingslocal_ws_test.websocket', ROOT / 'websocket.py')
        self.module = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.module)
        self.hass = NS(data={'thingslocal_dashboard_active': True})
        self.connection = NS(user=NS(permissions=NS(check_entity=lambda entity_id, policy: entity_id == 'select.visible' and policy == 'read')),
                             send_result=Mock(), send_error=Mock())

    def test_restricted_user_gets_only_readable_device_area_and_no_native_identifier(self):
        first = 'thingslocal_aabbccddeeff_112233445566'
        second = 'thingslocal_000000000001_112233445566'
        self.entity_registry.entities = {
            'one': NS(entity_id='select.visible', unique_id=first+'_washing_program', platform='mqtt', device_id='one'),
            'two': NS(entity_id='sensor.private', unique_id=second+'_heating', platform='mqtt', device_id='two'),
        }
        self.device_registry.devices = {
            'one': NS(id='one', name='Visible', area_id='kitchen', identifiers={('mqtt',first),('mac','sensitive-mac')}),
            'two': NS(id='two', name='Private appliance', area_id='secret', identifiers={('mqtt',second)}),
        }
        self.area_registry.areas = {'kitchen':NS(id='kitchen',name='Kitchen'), 'secret':NS(id='secret',name='Private room')}
        self.module.metadata(self.hass, self.connection, {'id':7})
        _, response = self.connection.send_result.call_args.args
        self.assertEqual(len(response['devices']),1)
        entity = response['devices'][0]['entities'][0]
        self.assertFalse(entity['can_control'])
        serialized = json.dumps(response)
        for secret in ('Private appliance','Private room','sensitive-mac',first,second): self.assertNotIn(secret,serialized)

    def test_disabled_integration_does_not_expose_metadata(self):
        self.hass.data.clear()
        self.module.metadata(self.hass,self.connection,{'id':1})
        self.connection.send_error.assert_called_once()
        self.connection.send_result.assert_not_called()
