import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sentiment import analyse


class NegationRegressionTests(unittest.TestCase):
    def test_negated_positive_phrase_is_scored_negative(self):
        text = "service ta thikai ho tara khasai ramro chai haina hai timing"
        result = analyse(text)
        self.assertEqual(result["label"], "negative")
        self.assertLess(result["score"], 0)

    def test_dampening_words_weaken_sentiment(self):
        text = "service is a little bit good"
        result = analyse(text)
        self.assertEqual(result["label"], "neutral")
        self.assertLess(abs(result["score"]), 0.5)


if __name__ == "__main__":
    unittest.main()
