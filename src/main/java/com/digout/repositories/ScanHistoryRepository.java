package com.digout.repositories;

import com.digout.models.ScanHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScanHistoryRepository extends JpaRepository<ScanHistory, Long> {
    List<ScanHistory> findByUserIdOrderByScannedAtDesc(Long userId);
    
    @org.springframework.transaction.annotation.Transactional
    void deleteByUserId(Long userId);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("DELETE FROM ScanHistory s WHERE s.user.id = :userId AND LOWER(s.productName) = LOWER(:productName)")
    void deleteByUserIdAndProductNameIgnoreCase(@org.springframework.data.repository.query.Param("userId") Long userId, @org.springframework.data.repository.query.Param("productName") String productName);
}
