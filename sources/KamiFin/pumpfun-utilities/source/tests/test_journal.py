"""Tests for the pure helpers in scripts/pumpfun_journal.py. Synthetic data only."""
import importlib.util
import os
import pathlib
import unittest

os.environ["PUMPFUN_WALLET"] = "TestWallet1111111111111111111111111111111111"
os.environ["PUMPFUN_EXTRA_WALLETS"] = "second=SecondWallet2222222222222222222222222222222, bad, =x,main=Nope"

SPEC = importlib.util.spec_from_file_location(
    "journal", pathlib.Path(__file__).resolve().parent.parent / "scripts" / "pumpfun_journal.py"
)
journal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(journal)


class ExtraWallets(unittest.TestCase):
    def test_reads_label_address_pairs_and_skips_junk(self):
        self.assertEqual(
            journal.extra_wallets(), {"second": "SecondWallet2222222222222222222222222222222"}
        )


class OpenRows(unittest.TestCase):
    def position(self, mint, value, cost, chain=1399811149):
        return {
            "coinMint": mint, "valueUsd": value, "costBasisUsd": cost, "chainId": chain,
            "coin": {"symbol": mint.upper(), "name": mint, "marketCapUsd": 1000},
        }

    def test_dust_is_dropped_and_the_biggest_comes_first(self):
        rows = journal.open_rows(
            [self.position("a", 5, 4), self.position("b", 50, 80), self.position("c", 1, 1)], 2
        )
        self.assertEqual([r["mint"] for r in rows], ["b", "a"])

    def test_unrealized_is_value_minus_cost(self):
        row = journal.open_rows([self.position("b", 50, 80)], 2)[0]
        self.assertEqual(row["upnl"], -30)

    def test_chain_names(self):
        row = journal.open_rows([self.position("x", 9, 9, chain=4663)], 2)[0]
        self.assertEqual(row["chain"], "Robinhood")


class ParseJournal(unittest.TestCase):
    TEXT = (
        "# Trade journal\n\n"
        "## 2026-10-01 AAA \"Aaa\" (Solana, pump.fun) [CLOSED]\nca: MintA\nsize: $10.00\n\n"
        "## 2026-10-02 BBB \"Bbb\" (Solana, pump.fun) [CLOSED]\nca: MintB\nwallet: second\n"
    )

    def test_blocks_without_a_wallet_line_belong_to_main(self):
        found = journal.parse_journal(self.TEXT)
        self.assertEqual([(w, m) for w, m, _ in found], [("main", "MintA"), ("second", "MintB")])


class Demo(unittest.TestCase):
    def test_demo_rows_have_the_shape_the_pane_reads_and_no_real_data(self):
        import contextlib, io, json
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            journal.demo_json()
        data = json.loads(buf.getvalue())
        self.assertEqual(data["failed"], [])
        self.assertGreaterEqual(len(data["rows"]), 4)
        for row in data["rows"]:
            self.assertEqual(sorted(row), ["chain", "cost", "mc", "mint", "symbol", "upnl", "value", "wallet"])
            self.assertAlmostEqual(row["upnl"], row["value"] - row["cost"])
        self.assertNotIn(os.environ["PUMPFUN_WALLET"], buf.getvalue())


if __name__ == "__main__":
    unittest.main()
