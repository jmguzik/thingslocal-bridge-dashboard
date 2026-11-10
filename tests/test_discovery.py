import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('discovery', Path(__file__).parents[1] / 'custom_components/thingslocal_dashboard/discovery.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
IDENTIFIER = 'thingslocal_aabbccddeeff_112233445566'


def device(identifier=IDENTIFIER, **kwargs):
    return dict(id='device', name='Example appliance', model='Any model', identifiers=[('mqtt', identifier)], area_id='kitchen', **kwargs)


def entity(suffix='power', **kwargs):
    result = dict(entity_id='sensor.renamed_by_owner', unique_id=IDENTIFIER + '_' + suffix, platform='mqtt', device_id='device', original_name='Reading')
    result.update(kwargs); return result


class DiscoveryTests(unittest.TestCase):
    def test_shared_lock_and_timer_do_not_turn_generic_appliance_into_cooktop(self):
        entries = [entity(module.field_key('main', cap, attr), entity_id='sensor.'+str(index))
            for index, (cap,attr) in enumerate([('samsungce.kidsLockControl','lockState'),('samsungce.countDownTimer','currentValue')])]
        result=self.discover(entries)
        self.assertEqual(result[0]['profile'],'generic')
        self.assertEqual({e['role'] for e in result[0]['entities']},{'panel_lock','zone_timer'})

    def discover(self, entities, devices=None, read=lambda _: True, control=lambda _: True):
        return module.discover(entities, devices or {'device': device()}, {'kitchen': 'Kitchen'}, read, control)

    def test_discovery_uses_registry_identity_not_entity_names_or_model(self):
        field = module.field_key('main', 'switch', 'switch')
        result = self.discover([entity(field, entity_id='binary_sensor.my_own_name')])
        self.assertEqual(result[0]['entities'][0]['role'], 'power')
        self.assertEqual(result[0]['profile'], 'generic')
        self.assertEqual(result[0]['area'], 'Kitchen')

    def test_permissions_are_applied_before_device_area_and_counts(self):
        entries = [entity('washing_program', entity_id='select.visible'), entity('heating', entity_id='binary_sensor.private')]
        result = self.discover(entries, read=lambda key: key == 'select.visible', control=lambda _: False)
        self.assertEqual(len(result[0]['entities']), 1)
        self.assertFalse(result[0]['entities'][0]['can_control'])
        self.assertEqual(self.discover(entries, read=lambda _: False), [])

    def test_arbitrary_future_capabilities_remain_generic_and_visible(self):
        result = self.discover([entity('f_unrecognized', original_name='Future reading')])
        self.assertEqual(result[0]['entities'][0]['role'], 'generic')
        self.assertEqual(result[0]['entities'][0]['name'], 'Future reading')

    def test_zone_components_are_identifiers_not_positions(self):
        entries = [entity(module.field_key(component, 'samsungce.cooktopHeatingPower', 'manualLevel'), entity_id=f'sensor.zone_{index}')
                   for index, component in enumerate(('burner-03', 'burner-12'))]
        result = self.discover(entries)
        self.assertEqual(result[0]['profile'], 'cooktop')
        self.assertEqual({e['component'] for e in result[0]['entities']}, {'burner-03', 'burner-12'})
        unknown = self.discover([entity(module.field_key('custom-zone', 'samsungce.cooktopHeatingPower', 'manualLevel'))])
        self.assertEqual(unknown[0]['entities'][0]['role'], 'generic')

    def test_disabled_hidden_unrelated_and_foreign_identities_are_excluded(self):
        for override in ({'hidden_by':'user'}, {'disabled_by':'integration'}, {'platform':'other'}, {'unique_id':'foreign_heating'}):
            with self.subTest(override=override): self.assertEqual(self.discover([entity(**override)]), [])
        self.assertEqual(self.discover([entity()], {'device':device(disabled_by='user')}), [])
        self.assertEqual(self.discover([entity()], {'device':device(identifier='samsung_old') }), [])

    def test_only_exact_program_select_can_be_writable(self):
        entries = [entity('washing_program', entity_id='sensor.wrong_domain'), entity('power', entity_id='switch.some_switch')]
        self.assertTrue(all(not e['can_control'] for e in self.discover(entries)[0]['entities']))
        result = self.discover([entity('washing_program', entity_id='select.any_name')])
        self.assertTrue(result[0]['entities'][0]['can_control'])

    def test_renamed_devices_and_separate_installations_do_not_merge(self):
        second = 'thingslocal_000000000001_112233445566'
        devices = {'device': device(name_by_user='My kitchen'),
                   'two':dict(device(identifier=second), id='two', area_id=None)}
        entries = [entity(), entity(unique_id=second+'_power', device_id='two', entity_id='sensor.second')]
        result = self.discover(entries, devices)
        self.assertEqual(len(result), 2)
        self.assertIn('My kitchen', [d['name'] for d in result])
        self.assertNotIn('identifiers', result[0]); self.assertNotIn('unique_id', result[0]['entities'][0])
