package com.digout.repositories;

import com.digout.models.CachedAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface CachedAnalysisRepository extends JpaRepository<CachedAnalysis, Long> {
    // NOTE: productName and countryCode are always stored lowercase by the entity setters,
    // so an exact-match query correctly hits the unique index without a LOWER() full scan.
    Optional<CachedAnalysis> findByProductNameAndCountryCode(String productName, String countryCode);

    @Transactional
    void deleteByCreatedAtBefore(LocalDateTime cutoff);
}
